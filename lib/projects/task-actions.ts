/**
 * Shared task-progress actions — Start and Complete (f-status-model §20 t-1).
 *
 * Under the new status model you claim **features, not tasks**: a task is *born*
 * `claimed` (owned by the feature owner) when the feature is planned. These are
 * the two hand transitions that move it forward — **Start** (`claimed → active`)
 * and **Complete** (`active → merged`) — replacing the retired `claim_task`
 * pull. `f-github-sync` will later automate Complete on PR-merge; until then both
 * are drivable from the task sheet so the flow is fully exercisable in the Hub.
 *
 * Pull-not-push, still soft (§5): Start never hard-locks — it credits the doer
 * (`claimedByUserId → caller`), opens a `TaskClaim` as the *active-work* record
 * (the soft-collision + history source now that task-claiming is gone), and
 * returns **soft file-overlap warnings** against other open (active) claims for
 * the human to weigh. Both are lenient/idempotent (a no-op when already there),
 * so a double-click or an out-of-band `f-github-sync` complete can't error.
 *
 * Membership is the [[f-access]] funnel's (`resolveTaskAccess`): a non-member, or
 * a task in a project the caller can't see, is `NotFoundError` (→ 404, never
 * 403). An optional `expectedProjectId` scopes the task to a specific project so
 * the consumer route can reject a cross-project id-swap (matching the read).
 */
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError } from '@/lib/api/errors';
import type { TaskStatus } from '@prisma/client';
import { resolveTaskAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { detectFileOverlapWarnings, type CollisionWarning } from '@/lib/projects/collision';

export interface TaskActionResult {
  taskId: string;
  /** The task's stored status after the action. */
  status: TaskStatus;
  /** Soft warnings — advisory, never a block (Start only). */
  warnings: CollisionWarning[];
}

/** Resolve + project-scope a task, or throw the funnel's 404. */
async function resolveScoped(userId: string, taskId: string, expectedProjectId?: string) {
  const access = await resolveTaskAccess(userId, taskId);
  if (!access.ok) throw new NotFoundError(`Task ${taskId} not found`);
  const task = access.task;
  if (expectedProjectId && task.projectId !== expectedProjectId) {
    throw new NotFoundError(`Task ${taskId} not found`);
  }
  return task;
}

/**
 * Start `taskId` (claimed → active) for `userId`: credits the doer, opens a fresh
 * active-work `TaskClaim`, and returns soft file-overlap warnings. A no-op (no
 * status change, no event) when the task is already `merged` — you can't restart
 * finished work. Throws `NotFoundError` (→ 404) for a non-member / unknown task,
 * or one outside `expectedProjectId`.
 */
export async function startTask(
  userId: string,
  taskId: string,
  expectedProjectId?: string
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  // Can't restart finished work — a lenient no-op, never an error.
  if (task.status === 'merged') {
    return { taskId: task.taskId, status: 'merged', warnings: [] };
  }

  const warnings: CollisionWarning[] = [];

  // Heads-up when the task is owned/held by someone else (born claimed by the
  // feature owner; a different member starting it is taking over the active work).
  if (task.claimedByUserId && task.claimedByUserId !== userId) {
    warnings.push({
      kind: 'already_claimed',
      userId: task.claimedByUserId,
      taskId: task.taskId,
      message: 'Heads-up: this task is currently held by someone else.',
    });
  }

  // Soft file-collision: other open (active) claims in the project whose scope
  // overlaps this task's declared scope. Skipped when this task declares none.
  if (task.filesScope.length > 0) {
    const otherOpenClaims = await prisma.taskClaim.findMany({
      where: {
        releasedAt: null,
        userId: { not: userId },
        taskId: { not: task.taskId },
        task: { feature: { projectId: task.projectId } },
      },
      select: {
        userId: true,
        claimedAt: true,
        task: { select: { id: true, title: true, filesScope: true } },
      },
    });
    warnings.push(
      ...detectFileOverlapWarnings(
        task.filesScope,
        otherOpenClaims.map((c) => ({
          userId: c.userId,
          claimedAt: c.claimedAt,
          taskId: c.task.id,
          taskTitle: c.task.title,
          filesScope: c.task.filesScope,
        }))
      )
    );
  }

  await executeTransaction(async (tx) => {
    // Release any prior open claim (records the handoff), then open a fresh
    // active-work claim for the caller and point the task at them.
    await tx.taskClaim.updateMany({
      where: { taskId: task.taskId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.taskClaim.create({ data: { taskId: task.taskId, userId } });
    await tx.task.update({
      where: { id: task.taskId },
      data: { status: 'active', claimedByUserId: userId },
    });
    // Reuse `task_claimed` for "actively taken" (no new ProjectEventKind).
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_claimed',
      actorUserId: userId,
      metadata: { from: task.status, previousClaimant: task.claimedByUserId },
    });
  });

  logAdminAction({
    userId,
    action: 'task.start',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { warningCount: warnings.length, from: task.status },
  });

  return { taskId: task.taskId, status: 'active', warnings };
}

/**
 * Complete `taskId` (→ merged) for `userId`: closes the open active-work claim and
 * journals the merge. Lenient — advances from `claimed` or `active`, and a no-op
 * when already `merged`. Throws `NotFoundError` (→ 404) for a non-member / unknown
 * task, or one outside `expectedProjectId`.
 */
export async function completeTask(
  userId: string,
  taskId: string,
  expectedProjectId?: string
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  // Already done — idempotent no-op (e.g. a re-fired f-github-sync merge event).
  if (task.status === 'merged') {
    return { taskId: task.taskId, status: 'merged', warnings: [] };
  }

  await executeTransaction(async (tx) => {
    await tx.taskClaim.updateMany({
      where: { taskId: task.taskId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.task.update({ where: { id: task.taskId }, data: { status: 'merged' } });
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_merged',
      actorUserId: userId,
      metadata: { from: task.status },
    });
  });

  logAdminAction({
    userId,
    action: 'task.complete',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { from: task.status },
  });

  return { taskId: task.taskId, status: 'merged', warnings: [] };
}
