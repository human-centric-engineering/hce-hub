/**
 * Shared claim-a-task service (f-task-sheet §11 t-3).
 *
 * The core of "claim a task" — pull-not-push (§5): claiming always succeeds and
 * never hard-locks; it records a `TaskClaim`, points `Task.claimedByUserId` at
 * the caller (releasing any prior open claim), and returns **soft collision
 * warnings** (already-claimed / file-overlap) for the human to weigh. Extracted
 * here so **both** callers run identical logic with no drift: the `claim_task`
 * capability (MCP / chat) and the consumer `POST …/tasks/[taskId]/claim` route
 * (the task sheet's Claim button).
 *
 * Membership is the [[f-access]] funnel's (`resolveTaskAccess`): a non-member,
 * or a task in a project the caller can't see, is `NotFoundError` (→ 404, never
 * 403). An optional `expectedProjectId` scopes the task to a specific project so
 * the consumer route can reject a cross-project id-swap (matching the read).
 * A null stored claimant (erased user) counts as unclaimed — no warning.
 */
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError } from '@/lib/api/errors';
import { resolveTaskAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';
import { detectFileOverlapWarnings, type CollisionWarning } from '@/lib/projects/collision';

export interface ClaimTaskResult {
  taskId: string;
  claimed: boolean;
  /** Soft warnings — advisory, never a block. */
  warnings: CollisionWarning[];
}

/**
 * Claim `taskId` for `userId`. Throws `NotFoundError` (→ 404) for a non-member /
 * unknown task, or one outside `expectedProjectId` when that is supplied.
 */
export async function claimTask(
  userId: string,
  taskId: string,
  expectedProjectId?: string
): Promise<ClaimTaskResult> {
  const access = await resolveTaskAccess(userId, taskId);
  if (!access.ok) throw new NotFoundError(`Task ${taskId} not found`);
  const task = access.task;
  // Scope to the route's project (no cross-project id-swap) when asked to.
  if (expectedProjectId && task.projectId !== expectedProjectId) {
    throw new NotFoundError(`Task ${taskId} not found`);
  }

  const warnings: CollisionWarning[] = [];

  // Already claimed by another *live* claimant? (A null claimant — erased user —
  // is treated as unclaimed, so no warning.)
  if (task.claimedByUserId && task.claimedByUserId !== userId) {
    warnings.push({
      kind: 'already_claimed',
      userId: task.claimedByUserId,
      taskId: task.taskId,
      message: 'Heads-up: this task is already claimed by someone else.',
    });
  }

  // Other open claims in the project whose files overlap this task's declared
  // scope — the soft file-collision signal. Skipped when this task declares no
  // scope (nothing could overlap), avoiding a project-wide claims query.
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
    // Release any prior open claim on this task (records the handoff), then open
    // a fresh claim for the caller and point the task at them.
    await tx.taskClaim.updateMany({
      where: { taskId: task.taskId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.taskClaim.create({ data: { taskId: task.taskId, userId } });
    await tx.task.update({
      where: { id: task.taskId },
      data: { status: 'claimed', claimedByUserId: userId },
    });
    // Journal the claim inside the same tx (an event iff the claim commits).
    // Emitting here — in the shared service, not each caller — means the
    // capability AND the consumer route both journal identically, no drift.
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_claimed',
      actorUserId: userId,
      metadata: { previousClaimant: task.claimedByUserId },
    });
  });

  logAdminAction({
    userId,
    action: 'task.claim',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { warningCount: warnings.length, previousClaimant: task.claimedByUserId },
  });

  return { taskId: task.taskId, claimed: true, warnings };
}
