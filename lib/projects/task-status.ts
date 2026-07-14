/**
 * Effective task status — the computed view of where a task really stands.
 *
 * `Task.status` (the stored `TaskStatus` enum: backlog | available | claimed |
 * in_pr | merged) is the *data* enum. The **effective** status layers two
 * runtime facts the stored value can't hold, and is the single source of truth
 * every read surface (`next-task` here, `f-board-view` later) computes through
 * so the two never diverge:
 *
 *  1. **A claim only counts with a live claimant.** After a user erasure the DB
 *     leaves `status = 'claimed'` with `claimedByUserId = null` (the satellite
 *     FK's ON DELETE SET NULL — f-data-model). Such a task is NOT really
 *     claimed; effective status returns it to the pullable pool. (Carried
 *     finding — f-data-model t-2 `/code-review`.)
 *  2. **`available` means genuinely pullable.** A task whose dependency edges
 *     aren't all `merged` is `blocked` — you can't pull it yet, even though its
 *     stored status is `available` (v1-requirements §5: "skips anything blocked
 *     by an unmerged PR").
 *
 * `blocked` is therefore a *computed* status with no stored counterpart; the
 * other values mirror the stored enum. Ordering low→high pullability:
 * merged (done) · in_pr · claimed · blocked · backlog · available.
 */

import type { TaskStatus } from '@prisma/client';

/** The stored data statuses plus the computed `blocked`. */
export type EffectiveStatus = TaskStatus | 'blocked';

/** The minimal task shape effective status needs — a subset of `Task`. */
export interface TaskStatusInput {
  status: TaskStatus;
  claimedByUserId: string | null;
}

/** The minimal dependency shape — the status of each task this task depends on. */
export interface DependencyStatusInput {
  status: TaskStatus;
}

/**
 * Compute a task's effective status from its stored status, its claimant, and
 * the statuses of the tasks it depends on.
 *
 * @param task  the task's stored `status` + `claimedByUserId`
 * @param deps  the `dependsOn` task of each of this task's dependency edges
 */
export function computeEffectiveStatus(
  task: TaskStatusInput,
  deps: DependencyStatusInput[]
): EffectiveStatus {
  // Terminal / in-flight stored states are authoritative — a merged or
  // in-PR task is exactly that regardless of deps or claimant.
  if (task.status === 'merged') return 'merged';
  if (task.status === 'in_pr') return 'in_pr';

  // A claim counts only with a live claimant; a null claimant (erased user)
  // is treated as unclaimed and falls through to the pullability check.
  if (task.status === 'claimed' && task.claimedByUserId !== null) return 'claimed';

  // Not yet promoted to the pullable pool — deps are irrelevant.
  if (task.status === 'backlog') return 'backlog';

  // `available` (or claimed-with-null-claimant): pullable only when EVERY
  // dependency is merged; otherwise it's blocked.
  const blocked = deps.some((d) => d.status !== 'merged');
  return blocked ? 'blocked' : 'available';
}

/** Convenience predicate: is this task genuinely pullable right now? */
export function isPullable(task: TaskStatusInput, deps: DependencyStatusInput[]): boolean {
  return computeEffectiveStatus(task, deps) === 'available';
}
