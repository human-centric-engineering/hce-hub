/**
 * `create_task` — the feature owner promotes a planned task into the Hub
 * (v1-requirements §11): declares its title, file scope, and dependencies on
 * existing tasks. The created task is `available` (ready to pull); if its
 * dependencies aren't all merged yet, `computeEffectiveStatus` reports it as
 * `blocked` until they are, so `next_task` won't recommend it prematurely.
 *
 * Authorization is the `owner` tier — the feature's owner or a project lead —
 * routed through `resolveFeatureAccess` (a non-member sees `not_found`, no
 * enumeration). Dependencies are validated to exist within the same project.
 *
 * Acyclicity is NOT checked here: a brand-new task only gains OUTGOING edges to
 * existing tasks, so it cannot close a cycle or self-loop (nothing points at a
 * task that doesn't exist yet). The cycle guard belongs to the flows that
 * connect two *existing* items — manual board dep-editing, or the AI edge
 * proposers (f-intake / f-sidekick) — and is built there (planning-retro B26).
 */

import { z } from 'zod';
import type { TaskStatus } from '@prisma/client';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  featureId: z.string().describe('The feature to add the task to.'),
  title: z.string().min(1).max(500).describe('Short description of the task.'),
  filesScope: z
    .array(z.string())
    .optional()
    .describe('Paths/globs the task expects to touch (a soft-collision hint, not enforced).'),
  dependsOnTaskIds: z
    .array(z.string())
    .optional()
    .describe('Ids of existing tasks in the same project this task depends on.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  status: TaskStatus;
  featureId: string;
}

export class CreateTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'create_task';
  readonly processesPii = true; // carries a free-text title

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'create_task',
    description:
      "Promote a planned task into a feature you own (or lead): declares its title, optional file scope, and optional dependencies on existing tasks. The task becomes available to pull (or blocked until its dependencies merge). Only the feature's owner or a project lead may create tasks.",
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to add the task to.' },
        title: { type: 'string', description: 'Short description of the task.' },
        filesScope: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional paths/globs the task expects to touch (a soft-collision hint).',
        },
        dependsOnTaskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional ids of existing tasks in the same project this task depends on.',
        },
      },
      required: ['featureId', 'title'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Redact the free-text title on the durable, broadly-visible message
    // provenance row; the ids/paths are not sensitive. The result carries no
    // free text (just ids + status).
    return {
      args: { ...args, title: redactedString(`title (${args.title.length} chars)`) },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('create_task requires a signed-in caller.', 'no_user_context');
    }

    const access = await resolveFeatureAccess(userId, args.featureId, 'owner');
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Feature ${args.featureId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can create tasks.', 'forbidden');
    }

    // Validate dependencies exist within the same project (integrity + scope —
    // you can't depend on a task in a project you can't see). De-duplicated.
    const depIds = [...new Set(args.dependsOnTaskIds ?? [])];
    if (depIds.length > 0) {
      const found = await prisma.task.findMany({
        where: { id: { in: depIds }, feature: { projectId: access.feature.projectId } },
        select: { id: true },
      });
      if (found.length !== depIds.length) {
        return this.error(
          'One or more dependencies were not found in this project.',
          'invalid_dependency'
        );
      }
    }

    const task = await executeTransaction(async (tx) => {
      // Assign the next project-wide task number by atomically bumping the
      // project counter. The row-level lock on the project row serializes
      // concurrent creates, so numbers are unique by construction (f-refs).
      const { taskCounter } = await tx.project.update({
        where: { id: access.feature.projectId },
        data: { taskCounter: { increment: 1 } },
        select: { taskCounter: true },
      });
      const created = await tx.task.create({
        data: {
          featureId: args.featureId,
          number: taskCounter,
          title: args.title,
          status: 'available',
          filesScope: args.filesScope ?? [],
        },
        select: { id: true, status: true },
      });
      if (depIds.length > 0) {
        await tx.taskDependency.createMany({
          data: depIds.map((dependsOnTaskId) => ({ taskId: created.id, dependsOnTaskId })),
        });
      }
      return created;
    });

    logAdminAction({
      userId,
      action: 'task.create',
      entityType: 'app_task',
      entityId: task.id,
      entityName: args.title,
      metadata: { featureId: args.featureId, dependsOnTaskIds: depIds },
    });

    return this.success({ taskId: task.id, status: task.status, featureId: args.featureId });
  }
}
