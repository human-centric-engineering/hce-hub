/**
 * `create_task` — the feature owner adds a task to a feature they own
 * (v1-requirements §11): declares its title, file scope, and dependencies on
 * existing tasks. The created task is born `claimed` and owned by the feature
 * owner (f-status-model §20); if its dependencies aren't all merged yet,
 * `computeEffectiveStatus` reports it as `blocked` until they are, so `next_task`
 * won't recommend it prematurely.
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
import { TaskKind, type TaskStatus } from '@prisma/client';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { phaseBelongsToProject } from '@/lib/projects/phases-service';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { checkIdeaPromotable, resolveIdeaOnPromotion } from '@/lib/projects/idea-promotion';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  featureId: z.string().describe('The feature to add the task to.'),
  title: z.string().min(1).max(500).describe('Short description of the task.'),
  description: z
    .string()
    .max(10000)
    .optional()
    .describe('Full task detail (markdown) — what to build and why.'),
  doneWhen: z.string().max(2000).optional().describe("The task's acceptance contract."),
  filesScope: z
    .array(z.string())
    .optional()
    .describe('Paths/globs the task expects to touch (a soft-collision hint, not enforced).'),
  dependsOnTaskIds: z
    .array(z.string())
    .optional()
    .describe('Ids of existing tasks in the same project this task depends on.'),
  kind: z
    .nativeEnum(TaskKind)
    .optional()
    .describe(
      "Task kind: 'bug' for a defect on the feature it broke (prioritised by next_task, kept out of completion progress and tallied as an open fix); 'enhancement' for a task-sized improvement to work that already exists; defaults to 'feature_work'. Work raised after its feature shipped never counts toward that feature's completion, whatever its kind — so file an improvement as 'enhancement', not as a 'bug'."
    ),
  phaseId: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Optional: commit this task to a phase in this project — the phase that chose to do the work, when that differs from its feature's phase. Omit to inherit the feature's phase."
    ),
  fromIdeaId: z
    .string()
    .optional()
    .describe(
      'Optional: the id of an OPEN idea in this project being promoted into this task — it is marked promoted and linked, atomically. Use with kind:"bug" to promote an idea straight to a bug.'
    ),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  /** The created task's project-wide `t-N` ref (f-refs) — report "created t-N" without a second read (t-66). */
  number: number | null;
  status: TaskStatus;
  featureId: string;
}

export class CreateTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'create_task';
  readonly processesPii = true; // carries a free-text title

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'create_task',
    description:
      "Add a task to a feature you own (or lead): declares its title, optional description + acceptance contract (done-when), optional file scope, optional dependencies on existing tasks, and optionally the phase that chose the work (phaseId — omit to inherit the feature's phase). The task is born claimed and owned by the feature owner (blocked until its dependencies merge). Only the feature's owner or a project lead may create tasks. The result includes the created task id + assigned t-N (report it without a re-read).",
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to add the task to.' },
        title: { type: 'string', description: 'Short description of the task.' },
        description: {
          type: 'string',
          description: 'Full task detail (markdown) — what to build and why.',
        },
        doneWhen: { type: 'string', description: "The task's acceptance contract." },
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
        kind: {
          type: 'string',
          enum: ['feature_work', 'bug', 'enhancement'],
          description:
            "Optional task kind — 'bug' for a defect on the feature it broke (prioritised by next_task, kept out of completion progress and tallied as an open fix); 'enhancement' for a task-sized improvement to work that already exists; defaults to 'feature_work'. Work raised after its feature shipped never counts toward that feature's completion, whatever its kind — so file an improvement as 'enhancement', not as a 'bug'.",
        },
        phaseId: {
          type: 'string',
          description:
            "Optional: commit this task to a phase in this project — the phase that chose to do the work, when that differs from its feature's phase. Omit to inherit the feature's phase.",
        },
        fromIdeaId: {
          type: 'string',
          description:
            'Optional: the id of an open idea in this project being promoted into this task — it is marked promoted and linked, atomically. Use with kind:"bug" to promote an idea straight to a bug.',
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
    // Redact the free-text title / description / done-when on the durable,
    // broadly-visible message provenance row; the ids/paths are not sensitive.
    // The result carries no free text (just ids + status).
    return {
      args: {
        ...args,
        title: redactedString(`title (${args.title.length} chars)`),
        description: args.description
          ? redactedString(`description (${args.description.length} chars)`)
          : null,
        doneWhen: args.doneWhen ? redactedString(`doneWhen (${args.doneWhen.length} chars)`) : null,
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('create_task requires a signed-in caller.', 'no_user_context');
    }

    const access = await resolveFeatureAccess(
      userId,
      args.featureId,
      'owner',
      context.scope?.projectId
    );
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

    // Phase commitment (§32 t-80) — the phase that CHOSE this work, when that
    // differs from its feature's phase. Omitted means inherit, which is the
    // default. Same-project guard shared with update_task / update_feature.
    // `null` is accepted as "inherit" (not an error): update_task and
    // update_feature both take a nullable phaseId, and the JSON functionDefinition
    // carries no nullability signal, so an agent emitting null here is doing the
    // natural thing. Only a non-null value needs validating.
    if (
      args.phaseId != null &&
      !(await phaseBelongsToProject(args.phaseId, access.feature.projectId))
    ) {
      return this.error('That phase was not found in this project.', 'invalid_phase');
    }

    const taskKind = args.kind ?? 'feature_work';

    // Promotion: the idea must exist in THIS project and be open (friendly
    // pre-check; the in-tx guard below is the race backstop).
    if (args.fromIdeaId !== undefined) {
      const promotable = await checkIdeaPromotable(access.feature.projectId, args.fromIdeaId);
      if (!promotable.ok) {
        return this.error(promotable.message, promotable.code);
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
          description: args.description ?? null,
          doneWhen: args.doneWhen ?? null,
          kind: taskKind,
          // Born `claimed`, owned by the feature owner (f-status-model §20); its
          // effective status is `blocked` until its dependencies merge.
          status: 'claimed',
          filesScope: args.filesScope ?? [],
          assigneeUserId: access.feature.ownerUserId,
          claimedByUserId: access.feature.ownerUserId,
          phaseId: args.phaseId ?? null,
        },
        select: { id: true, number: true, status: true },
      });
      if (depIds.length > 0) {
        await tx.taskDependency.createMany({
          data: depIds.map((dependsOnTaskId) => ({ taskId: created.id, dependsOnTaskId })),
        });
      }
      // Journal the creation inside the same tx (an event iff the task commits).
      // A `bug`-kind task is journalled as `bug_reported` so "which shipped work
      // generates defects" stays queryable (f-bug-handling §22-02).
      await recordProjectEvent(tx, {
        projectId: access.feature.projectId,
        featureId: args.featureId,
        taskId: created.id,
        kind: taskKind === 'bug' ? 'bug_reported' : 'task_created',
        actorUserId: userId,
        metadata: {
          status: created.status,
          kind: taskKind,
          ...(args.fromIdeaId ? { fromIdeaId: args.fromIdeaId } : {}),
        },
      });
      // Promotion: mark the source idea promoted into this task (bug ⇒ 'bug'),
      // atomically. Guarded on status:'open' inside the tx (race backstop).
      if (args.fromIdeaId !== undefined) {
        await resolveIdeaOnPromotion(tx, {
          ideaId: args.fromIdeaId,
          projectId: access.feature.projectId,
          kind: taskKind === 'bug' ? 'bug' : 'task',
          refId: created.id,
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
      metadata: {
        featureId: args.featureId,
        dependsOnTaskIds: depIds,
        ...(args.fromIdeaId ? { fromIdeaId: args.fromIdeaId } : {}),
      },
    });

    return this.success({
      taskId: task.id,
      number: task.number,
      status: task.status,
      featureId: args.featureId,
    });
  }
}
