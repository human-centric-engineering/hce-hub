/**
 * Effective task status — the computed view of where a task really stands.
 *
 * `Task.status` (the stored `TaskStatus` enum: claimed | active | merged) is the
 * *data* enum (f-status-model §20). A task is **born `claimed`** when its feature
 * is planned (you claim features, not tasks — the feature-claim cascade), goes
 * **`active`** while worked, and **`merged`** when done. The **effective** status
 * layers the one runtime fact the stored value can't hold, and is the single
 * source of truth every read surface (`next-task`, the Plan, the Board) computes
 * through so they never diverge:
 *
 *  - **`blocked`** — a `claimed` task whose dependency edges aren't all `merged`
 *    can't be started yet (v1-requirements §5: "skips anything blocked by an
 *    unmerged PR"). It's a *computed* overlay with no stored counterpart; the
 *    other values mirror the stored enum. `active`/`merged` are authoritative
 *    (a task being worked or done stays that regardless of deps).
 *
 * Readiness low→high: merged (done) · active (in progress) · blocked · claimed
 * (ready to start).
 */

import type { TaskStatus } from '@prisma/client';

/** The stored data statuses plus the computed `blocked`. */
export type EffectiveStatus = TaskStatus | 'blocked';

/** The minimal task shape effective status needs. */
export interface TaskStatusInput {
  status: TaskStatus;
}

/** The minimal dependency shape — the status of each task this task depends on. */
export interface DependencyStatusInput {
  status: TaskStatus;
}

/**
 * Compute a task's effective status from its stored status and the statuses of
 * the tasks it depends on.
 *
 * @param task  the task's stored `status`
 * @param deps  the `dependsOn` task of each of this task's dependency edges
 */
export function computeEffectiveStatus(
  task: TaskStatusInput,
  deps: DependencyStatusInput[]
): EffectiveStatus {
  // Being-worked / done stored states are authoritative — deps don't change them.
  if (task.status === 'merged') return 'merged';
  if (task.status === 'active') return 'active';

  // `claimed` (owned, not yet started): ready unless a dependency isn't merged,
  // in which case it's blocked (can't start yet).
  const blocked = deps.some((d) => d.status !== 'merged');
  return blocked ? 'blocked' : 'claimed';
}

/** Convenience predicate: is this task ready to start right now (deps all merged)? */
export function isReadyToStart(task: TaskStatusInput, deps: DependencyStatusInput[]): boolean {
  return computeEffectiveStatus(task, deps) === 'claimed';
}
