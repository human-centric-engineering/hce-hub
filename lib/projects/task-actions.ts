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
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import type { TaskStatus } from '@prisma/client';
import { resolveTaskAccess, canAccessProject } from '@/lib/projects/access';
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
 * Assign `taskId` to `assigneeUserId` (f-task-assignment §f-ta t1) — the missing
 * verb that re-sets the dormant `assigneeUserId` (born = feature owner, never
 * re-set until now). Self = "take/claim it", another = "reassign" — one verb.
 *
 * **Any project member may (re)assign** (call 2 — open/trusting; the caller's
 * membership is the `resolveTaskAccess` funnel's, deny ≡ 404). The **assignee**
 * must be a member of the task's project (else `ValidationError`). Decoupled from
 * feature ownership (call 4): never touches `Feature.ownerUserId`.
 *
 * Semantics:
 * - **Merged is a no-op** — completed work credits its doer (`claimedByUserId`);
 *   you don't reassign finished tasks (call 3 rider).
 * - **Active hands off cleanly** (call 1a): the open `TaskClaim` is released and
 *   the status reset `active → claimed`, so the new assignee starts fresh.
 * - `claimedByUserId` is synced to the new assignee in the `claimed` state (as a
 *   born task is), so the existing claimer-based plan/board display already shows
 *   the new person; the richer status-aware display is t2.
 *
 * Journals a `task_assigned` `ProjectEvent` (the handoff trail — who moved whose
 * work, and when) inside the same tx, and audit-logs it. An optional
 * `expectedProjectId` rejects a cross-project id-swap.
 */
export async function assignTask(
  userId: string,
  taskId: string,
  assigneeUserId: string,
  expectedProjectId?: string
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  // Can't reassign finished work — a merged task credits its doer; lenient no-op.
  if (task.status === 'merged') {
    return { taskId: task.taskId, status: 'merged', warnings: [] };
  }

  // The assignee must be a member of the task's project (deny ≡ not a member).
  const { basis } = await canAccessProject(assigneeUserId, task.projectId);
  if (basis === null) {
    throw new ValidationError('The assignee must be a member of this project.');
  }

  await executeTransaction(async (tx) => {
    // Release any open active-work claim (a no-op when the task hasn't started),
    // then point the task at the new assignee in the `claimed` state — resetting
    // an `active` task so the new person starts fresh (call 1a).
    await tx.taskClaim.updateMany({
      where: { taskId: task.taskId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    await tx.task.update({
      where: { id: task.taskId },
      data: { assigneeUserId, claimedByUserId: assigneeUserId, status: 'claimed' },
    });
    // Journal the handoff inside the same tx (an event iff the assignment commits).
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_assigned',
      actorUserId: userId,
      metadata: { assigneeUserId, from: task.status },
    });
  });

  logAdminAction({
    userId,
    action: 'task.assign',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { assigneeUserId, from: task.status },
  });

  return { taskId: task.taskId, status: 'claimed', warnings: [] };
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

/**
 * Link `taskId` to its pull request (`f-github-sync` §14 t-1). Sets/replaces
 * `Task.prUrl` and journals `task_pr_linked` — **no status change**: linking a PR
 * is not merging it, and the 3-state model (`claimed | active | merged`) has no
 * in-PR state. This is the "PR-URL declared by human in v1" groundwork; the §14
 * webhook later drives `completeTask` (not this) on the *merge* event, so the two
 * paths never fight over status.
 *
 * `prUrl` is expected already-validated (a member-facing http(s) URL — the
 * `set_pr` capability's Zod boundary does that; the render layer also
 * `sanitizeUrl`s it). Funnel-scoped like its siblings: a non-member, or a task in
 * a project the caller can't see, is `NotFoundError` (→ 404, never 403); an
 * optional `expectedProjectId` rejects a cross-project id-swap. Returns the
 * task's *unchanged* status so callers can confirm the no-op on the lifecycle.
 */
export async function setTaskPr(
  userId: string,
  taskId: string,
  prUrl: string,
  expectedProjectId?: string
): Promise<TaskActionResult> {
  const task = await resolveScoped(userId, taskId, expectedProjectId);

  await executeTransaction(async (tx) => {
    await tx.task.update({ where: { id: task.taskId }, data: { prUrl } });
    await recordProjectEvent(tx, {
      projectId: task.projectId,
      featureId: task.featureId,
      taskId: task.taskId,
      kind: 'task_pr_linked',
      actorUserId: userId,
      metadata: { prUrl },
    });
  });

  logAdminAction({
    userId,
    action: 'task.set_pr',
    entityType: 'app_task',
    entityId: task.taskId,
    metadata: { prUrl },
  });

  // No status change — return the current stored status so the no-op is explicit.
  return { taskId: task.taskId, status: task.status, warnings: [] };
}
