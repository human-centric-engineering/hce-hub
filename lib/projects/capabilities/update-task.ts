/**
 * `update_task` — edit an existing task's authored fields (f-authoring-fidelity
 * §21 t-b). The MCP verb that lets the record be *corrected from the Hub* rather
 * than the DB: `title`, `description`, `doneWhen`, `filesScope`, and its
 * **dependency edges** (cycle-guarded). A `note`-style amendment, so it emits
 * **no** `ProjectEventKind` (the lifecycle events — created/started/merged —
 * stay meaningful); it is audit-logged.
 *
 * `dependsOnTaskIds`, when supplied, **replaces** the task's outgoing edge set
 * (mirroring `update_feature`'s `dependsOnFeatureIds`): every target is verified
 * to be in the same project, and the whole task graph is proven acyclic before
 * any write. Unlike `create_task` — which adds a new leaf whose edges are
 * outgoing-only and so can never close a cycle — this connects two *existing*
 * tasks, which is precisely where the guard is load-bearing (planning-retro
 * B26/HB4). An empty array clears every edge.
 *
 * Only the fields you supply change — an omitted field is left untouched; a
 * `null` `description`/`doneWhen` clears it. At least one editable field must be
 * present (`nothing_to_update` otherwise).
 *
 * Authorization is the **owner** tier on the task's feature (`resolveFeatureAccess`
 * — the feature owner or a project lead): a non-member, or a task in a project the
 * caller can't see, is `not_found` (never `forbidden` — no enumeration); a member
 * who is neither owner nor lead is `forbidden`. Free text ⇒ `processesPii`.
 */

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
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
import { isWriteConflict, withWriteConflictRetry } from '@/lib/projects/write-conflict';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  taskId: z.string().describe('The task to edit.'),
  title: z.string().min(1).max(500).optional().describe('New title.'),
  description: z
    .string()
    .max(10000)
    .nullable()
    .optional()
    .describe('New full detail (markdown); null clears it.'),
  doneWhen: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe('New acceptance contract; null clears it.'),
  filesScope: z
    .array(z.string())
    .optional()
    .describe('New file-scope list — replaces the existing one.'),
  dependsOnTaskIds: z
    .array(z.string())
    .optional()
    .describe(
      'New dependency set — replaces the existing edges (existing tasks in this project). An empty array clears them.'
    ),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  /** The names of the fields actually changed. */
  updated: string[];
}

export class UpdateTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'update_task';
  readonly processesPii = true; // free-text title / description / done-when

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'update_task',
    description:
      "Edit an existing task's fields: title, description (markdown), done-when (acceptance contract), file scope, and/or its dependencies (replaces the existing edges; rejected if it would create a cycle). Only the fields you supply change; a null description/done-when clears it. Only the feature's owner or a project lead may edit its tasks. Does not change status.",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to edit.' },
        title: { type: 'string', description: 'New title.' },
        description: {
          type: 'string',
          description: 'New full detail (markdown); null clears it.',
        },
        doneWhen: { type: 'string', description: 'New acceptance contract; null clears it.' },
        filesScope: {
          type: 'array',
          items: { type: 'string' },
          description: 'New file-scope list — replaces the existing one.',
        },
        dependsOnTaskIds: {
          type: 'array',
          items: { type: 'string' },
          description:
            'New dependency set — replaces the existing edges (existing tasks in this project). An empty array clears them.',
        },
      },
      required: ['taskId'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask the free-text edits on the durable provenance row; the id is not
    // sensitive. `undefined` (field untouched) is preserved as-is.
    const mask = (v: string | null | undefined, label: string) =>
      typeof v === 'string' ? redactedString(`${label} (${v.length} chars)`) : v;
    return {
      args: {
        taskId: args.taskId,
        title: mask(args.title, 'title'),
        description: mask(args.description, 'description'),
        doneWhen: mask(args.doneWhen, 'doneWhen'),
        filesScope: args.filesScope,
        dependsOnTaskIds: args.dependsOnTaskIds,
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('update_task requires a signed-in caller.', 'no_user_context');
    }

    // Build the patch from supplied fields only (undefined = leave unchanged; a
    // null description/doneWhen clears it). Scalar-list updates use `{ set }`.
    const data: Prisma.TaskUpdateInput = {};
    const updated: string[] = [];
    if (args.title !== undefined) {
      data.title = args.title;
      updated.push('title');
    }
    if (args.description !== undefined) {
      data.description = args.description;
      updated.push('description');
    }
    if (args.doneWhen !== undefined) {
      data.doneWhen = args.doneWhen;
      updated.push('doneWhen');
    }
    if (args.filesScope !== undefined) {
      data.filesScope = { set: args.filesScope };
      updated.push('filesScope');
    }
    // `dependsOnTaskIds` is editable but not part of `data`, so it counts here.
    if (updated.length === 0 && args.dependsOnTaskIds === undefined) {
      return this.error('No fields to update were provided.', 'nothing_to_update');
    }

    // Resolve the task's feature for the owner-tier funnel. A missing task is
    // not_found; the funnel then maps non-member → not_found, member-non-owner →
    // forbidden (no enumeration). The feature's `projectId` scopes the dependency
    // validation below.
    const task = await prisma.task.findUnique({
      where: { id: args.taskId },
      select: { id: true, featureId: true, feature: { select: { projectId: true } } },
    });
    if (!task) {
      return this.error(`Task ${args.taskId} not found.`, 'not_found');
    }
    const access = await resolveFeatureAccess(
      userId,
      task.featureId,
      'owner',
      context.scope?.projectId
    );
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Task ${args.taskId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can edit its tasks.', 'forbidden');
    }

    // Dependency-edge replacement — validate targets, prove the whole task graph
    // stays acyclic, then swap the edges inside the transaction.
    const projectId = task.feature.projectId;
    let depsToSet: string[] | null = null;
    if (args.dependsOnTaskIds !== undefined) {
      depsToSet = [...new Set(args.dependsOnTaskIds)];
      if (depsToSet.includes(task.id)) {
        return this.error('A task cannot depend on itself.', 'dependency_cycle');
      }
      if (depsToSet.length > 0) {
        const found = await prisma.task.findMany({
          where: { id: { in: depsToSet }, feature: { projectId } },
          select: { id: true },
        });
        if (found.length !== depsToSet.length) {
          return this.error(
            'One or more dependencies were not found in this project.',
            'invalid_dependency'
          );
        }
      }
      updated.push('dependencies');
    }

    try {
      await withWriteConflictRetry(() =>
        executeTransaction(
          async (tx) => {
            // The proof runs FIRST, before any write. Rollback would undo a
            // scalar update anyway, but writing a row we're about to reject
            // means holding its lock across the graph read — and under
            // Serializable that lock can drag an unrelated concurrent editor of
            // the same row into an abort, for a request that was never going to
            // succeed. Prove, then write.
            if (depsToSet !== null) {
              // Rebuild the project's full task-edge set with this task's
              // outgoing edges replaced, and prove it's still a DAG. This read
              // lives INSIDE the transaction so the proof and the write share
              // one snapshot.
              const others = await tx.taskDependency.findMany({
                where: { task: { feature: { projectId } }, taskId: { not: task.id } },
                select: { taskId: true, dependsOnTaskId: true },
              });
              const edges = [
                ...others.map((e) => ({ from: e.taskId, to: e.dependsOnTaskId })),
                ...depsToSet.map((to) => ({ from: task.id, to })),
              ];
              // Throws DependencyCycleError → the transaction rolls back, so a
              // rejected edge set never leaves a partial write behind.
              assertAcyclic(edges);
            }
            if (Object.keys(data).length > 0) {
              await tx.task.update({ where: { id: task.id }, data });
            }
            if (depsToSet !== null) {
              // Replace the outgoing edge set (idempotent via the @@unique constraint).
              await tx.taskDependency.deleteMany({ where: { taskId: task.id } });
              if (depsToSet.length > 0) {
                await tx.taskDependency.createMany({
                  data: depsToSet.map((dependsOnTaskId) => ({ taskId: task.id, dependsOnTaskId })),
                });
              }
            }
          },
          // Serializable is what actually closes the race — moving the read inside
          // the transaction is necessary but NOT sufficient: under Read Committed
          // neither transaction sees the other's uncommitted edge, so both would
          // still validate clean and both would commit, leaving a cycle.
          //
          // Only the two `update_*` verbs read-then-write the graph, and SSI holds
          // among transactions that are *themselves* serializable — so these two
          // must match. `create_task` / `create_feature` / `plan_feature` add only
          // outgoing-only leaves, which nothing can point back at during their own
          // validation, so they cannot combine with an `update_*` edge to close a
          // cycle and correctly stay at the default isolation.
          //
          // Scoped to the edge path for the same reason: a plain title/doneWhen
          // edit is a single-row write with nothing to serialize against, so
          // raising its isolation would only convert a harmless row-lock wait
          // into a P2034 the caller has to retry — a regression, not a guard.
          depsToSet !== null ? { isolationLevel: 'Serializable' } : undefined
        )
      );
    } catch (err) {
      if (err instanceof DependencyCycleError) {
        return this.error(
          `Dependencies would form a cycle: ${err.cycle.join(' → ')}.`,
          'dependency_cycle'
        );
      }
      if (isWriteConflict(err)) {
        // Only reached once the in-process retries are also exhausted.
        return this.error(
          'A concurrent change to this task kept winning. Re-read it and retry.',
          'concurrent_modification'
        );
      }
      throw err;
    }

    logAdminAction({
      userId,
      action: 'task.update',
      entityType: 'app_task',
      entityId: task.id,
      metadata: { fields: updated },
    });

    return this.success({ taskId: task.id, updated });
  }
}
