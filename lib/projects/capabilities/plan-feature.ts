/**
 * `plan_feature` — turn an indicative feature's sketch into real, claimable tasks
 * (f-feature-planning §18). The owner-tier verb where planning becomes concrete:
 * it creates a batch of `Task` rows (each numbered via the project counter,
 * assigned to the feature owner, `available` to pull), wires their dependencies,
 * **replaces** the feature's `IndicativeTask` sketch (planning rarely survives
 * 1:1), and flips `planningStage → planned`. Emits `feature_planned` + one
 * `task_created` per task, atomically with the write.
 *
 * This is the **first flow that can create a dependency cycle** — a batch's tasks
 * may reference each other (`t2 → t1 → t2`) — so the combined edge set (batch refs
 * + existing task ids) is proven acyclic via `assertAcyclic` *before* any row is
 * written (planning-retro B26). Existing task-id dependencies are validated to
 * live in the same project.
 *
 * Authorization is the feature funnel at the `owner` tier (`resolveFeatureAccess`):
 * a non-member is `not_found`, a member who is neither owner nor lead is
 * `forbidden`. A feature that is already `planned` is rejected (`already_planned`)
 * rather than silently re-planned (which would strand its existing tasks). Task
 * titles + done-when are free text ⇒ `processesPii`.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { assertAcyclic, DependencyCycleError } from '@/lib/projects/dependency-graph';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { redactedString } from '@/lib/security/redact';

const taskSpec = z.object({
  ref: z
    .string()
    .min(1)
    .max(64)
    .describe('A batch-local id (e.g. "t1") other tasks in this batch can depend on.'),
  title: z.string().min(1).max(500).describe('The task title.'),
  doneWhen: z.string().max(2000).optional().describe("The task's acceptance contract."),
  filesScope: z
    .array(z.string())
    .optional()
    .describe('Paths/globs the task expects to touch (a soft-collision hint).'),
  dependsOn: z
    .array(z.string())
    .optional()
    .describe('Refs of other tasks in this batch, or ids of existing tasks in the project.'),
});

const schema = z.object({
  featureId: z.string().describe('The feature to plan (must be indicative).'),
  tasks: z.array(taskSpec).min(1).max(50).describe('The real tasks to create for this feature.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  featureId: string;
  taskIds: string[];
  planningStage: 'planned';
}

export class PlanFeatureCapability extends BaseCapability<Args, Data> {
  readonly slug = 'plan_feature';
  readonly processesPii = true; // free-text task titles + done-when

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'plan_feature',
    description:
      "Materialise a feature's tasks: creates real, claimable tasks (numbered, assigned to the feature owner, available to pull), wires their dependencies, replaces the indicative sketch, and marks the feature planned. Only the feature owner or a project lead may plan. A cyclic task batch is rejected.",
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to plan (must be indicative).' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ref: {
                type: 'string',
                description:
                  'A batch-local id (e.g. "t1") other tasks in this batch can depend on.',
              },
              title: { type: 'string', description: 'The task title.' },
              doneWhen: { type: 'string', description: "The task's acceptance contract." },
              filesScope: {
                type: 'array',
                items: { type: 'string' },
                description: 'Paths/globs the task expects to touch (a soft-collision hint).',
              },
              dependsOn: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Refs of other tasks in this batch, or ids of existing tasks in the project.',
              },
            },
            required: ['ref', 'title'],
          },
          description: 'The real tasks to create for this feature.',
        },
      },
      required: ['featureId', 'tasks'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask each task's free-text title + done-when; keep the structural fields
    // (ref / deps / filesScope) that carry no user content.
    return {
      args: {
        featureId: args.featureId,
        tasks: args.tasks.map((t) => ({
          ref: t.ref,
          title: redactedString(`title (${t.title.length} chars)`),
          doneWhen: t.doneWhen ? redactedString(`doneWhen (${t.doneWhen.length} chars)`) : null,
          filesScope: t.filesScope ?? [],
          dependsOn: t.dependsOn ?? [],
        })),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('plan_feature requires a signed-in caller.', 'no_user_context');
    }

    // Owner tier: the feature owner or a project lead. Non-member → not_found.
    const access = await resolveFeatureAccess(userId, args.featureId, 'owner');
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Feature ${args.featureId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can plan a feature.', 'forbidden');
    }
    // Planning replaces the sketch — re-planning a planned feature would strand
    // its existing real tasks, so require an indicative feature.
    if (access.feature.planningStage === 'planned') {
      return this.error('This feature is already planned.', 'already_planned');
    }

    // Refs must be unique within the batch, so a dependsOn ref resolves unambiguously.
    const refs = args.tasks.map((t) => t.ref);
    const refSet = new Set(refs);
    if (refSet.size !== refs.length) {
      return this.error('Task refs must be unique within the batch.', 'duplicate_ref');
    }

    // Split each dependency into a batch-local ref or an existing-task id.
    const existingDepIds = [
      ...new Set(args.tasks.flatMap((t) => (t.dependsOn ?? []).filter((d) => !refSet.has(d)))),
    ];
    if (existingDepIds.length > 0) {
      const found = await prisma.task.findMany({
        where: { id: { in: existingDepIds }, feature: { projectId: access.feature.projectId } },
        select: { id: true },
      });
      if (found.length !== existingDepIds.length) {
        return this.error(
          'One or more task dependencies were not found in this project.',
          'invalid_dependency'
        );
      }
    }

    // Each task's dependency list, de-duplicated — a repeated entry (e.g. an LLM
    // listing the same dep twice) would otherwise collide on
    // TaskDependency's @@unique([taskId, dependsOnTaskId]) and abort the write
    // (mirrors create_task's dedup).
    const depsByRef = new Map(args.tasks.map((t) => [t.ref, [...new Set(t.dependsOn ?? [])]]));

    // Prove the combined graph (batch refs + existing ids they point at) is a DAG
    // BEFORE writing anything — a cyclic batch is rejected, nothing is created.
    const edges = args.tasks.flatMap((t) =>
      depsByRef.get(t.ref)!.map((to) => ({ from: t.ref, to }))
    );
    try {
      assertAcyclic(edges);
    } catch (err) {
      if (err instanceof DependencyCycleError) {
        return this.error(
          `Task dependencies form a cycle: ${err.cycle.join(' → ')}.`,
          'dependency_cycle'
        );
      }
      throw err;
    }

    const taskIds = await executeTransaction(async (tx) => {
      // Create every task first so batch-local refs can resolve to real ids.
      const refToId = new Map<string, string>();
      const created: string[] = [];
      for (const spec of args.tasks) {
        // Bump the project counter per task (unique `number` by construction — f-refs).
        const { taskCounter } = await tx.project.update({
          where: { id: access.feature.projectId },
          data: { taskCounter: { increment: 1 } },
          select: { taskCounter: true },
        });
        const task = await tx.task.create({
          data: {
            featureId: args.featureId,
            number: taskCounter,
            title: spec.title,
            doneWhen: spec.doneWhen ?? null,
            status: 'available',
            filesScope: spec.filesScope ?? [],
            // Assignee defaults to the feature owner ("this is yours"); distinct
            // from the pull-claim. Null when a lead plans an unclaimed feature.
            assigneeUserId: access.feature.ownerUserId,
          },
          select: { id: true },
        });
        refToId.set(spec.ref, task.id);
        created.push(task.id);
      }

      // Wire dependencies (de-duplicated per task), resolving batch refs → created
      // ids (existing ids pass through).
      const depRows = args.tasks.flatMap((spec) =>
        depsByRef.get(spec.ref)!.map((to) => ({
          taskId: refToId.get(spec.ref)!,
          dependsOnTaskId: refToId.get(to) ?? to,
        }))
      );
      if (depRows.length > 0) {
        await tx.taskDependency.createMany({ data: depRows });
      }

      // Planning REPLACES the indicative sketch, and the feature becomes `planned`.
      await tx.indicativeTask.deleteMany({ where: { featureId: args.featureId } });
      await tx.feature.update({
        where: { id: args.featureId },
        data: { planningStage: 'planned' },
      });

      // Journal the plan + each task creation atomically with the write.
      await recordProjectEvent(tx, {
        projectId: access.feature.projectId,
        featureId: args.featureId,
        kind: 'feature_planned',
        actorUserId: userId,
        metadata: { taskCount: created.length },
      });
      for (const taskId of created) {
        await recordProjectEvent(tx, {
          projectId: access.feature.projectId,
          featureId: args.featureId,
          taskId,
          kind: 'task_created',
          actorUserId: userId,
          metadata: { status: 'available' },
        });
      }
      return created;
    });

    logAdminAction({
      userId,
      action: 'feature.plan',
      entityType: 'app_feature',
      entityId: args.featureId,
      metadata: { projectId: access.feature.projectId, taskCount: taskIds.length },
    });

    return this.success({ featureId: args.featureId, taskIds, planningStage: 'planned' });
  }
}
