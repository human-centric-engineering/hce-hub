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
 *  - **`withdrawn`** — the work is not going to happen (f-authoring-fidelity §21
 *    t-123). Also computed, from the `Task.withdrawnAt` instant rather than a
 *    stored status: that keeps this enum the *data* and the overlays *derived*,
 *    records **when**, and makes restore free — null the column and the prior
 *    status re-derives, where a stored value would have to remember what it
 *    displaced. Every work surface filters these out at the query; they stay
 *    readable through `get_task` and `list_tasks { status: 'withdrawn' }`.
 *
 * Readiness low→high: withdrawn (never) · merged (done) · active (in progress) ·
 * blocked · claimed (ready to start).
 */

import type { TaskStatus } from '@prisma/client';

/** The stored data statuses plus the computed `blocked` and `withdrawn`. */
export type EffectiveStatus = TaskStatus | 'blocked' | 'withdrawn';

/** The minimal task shape effective status needs. */
export interface TaskStatusInput {
  status: TaskStatus;
  /**
   * When the task was withdrawn; `null` for live work.
   *
   * **Required, not optional, on purpose.** Optional would let a caller that
   * forgot to select the column silently keep the old behaviour — a withdrawn
   * task reading `claimed` on one surface and `withdrawn` on another, which is
   * precisely the divergence this module exists to prevent. Required makes the
   * compiler ask the question at every call site.
   */
  withdrawnAt: Date | null;
}

/** The minimal dependency shape — the status of each task this task depends on. */
export interface DependencyStatusInput {
  status: TaskStatus;
  /** See `TaskStatusInput.withdrawnAt` — required for the same reason. */
  withdrawnAt: Date | null;
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
  //
  // `merged` is checked BEFORE `withdrawnAt` deliberately. `withdrawTask` refuses a
  // merged task, so the pair cannot occur; the order only decides which way an
  // impossible row would fail. Reading it `merged` ignores the withdrawal and shows
  // finished work as finished. Reading it `withdrawn` would drop shipped work out of
  // its feature's completion count and off every surface at once — a silent
  // subtraction from history. Same reasoning as `feature-progress.ts`: prefer the
  // failure that stays visible.
  if (task.status === 'merged') return 'merged';
  if (task.withdrawnAt != null) return 'withdrawn';
  if (task.status === 'active') return 'active';

  // `claimed` (owned, not yet started): ready unless a dependency isn't merged,
  // in which case it's blocked (can't start yet).
  //
  // **A withdrawn dependency does not block.** It can never reach `merged` — that is
  // what withdrawing it means — so treating it as outstanding would leave every
  // dependent permanently blocked with no way out but deleting the edge. Withdrawing
  // is therefore a decision with downstream reach, which is why `withdrawTask`
  // returns an advisory naming the unmerged tasks that depended on it: the work they
  // were waiting for is not coming, and that is for a human to weigh, not for this
  // function to hide.
  const blocked = deps.some((d) => d.withdrawnAt == null && d.status !== 'merged');
  return blocked ? 'blocked' : 'claimed';
}

/** Convenience predicate: is this task ready to start right now (deps all merged)? */
export function isReadyToStart(task: TaskStatusInput, deps: DependencyStatusInput[]): boolean {
  return computeEffectiveStatus(task, deps) === 'claimed';
}

/**
 * The user a task is **attributed to** on the Plan / Board (f-task-assignment §22
 * t2): the person a read surface shows against the task, and the Board lane it
 * routes into.
 *
 *  - **open** (`claimed`/`active`/`blocked`) → the **assignee** (`assigneeUserId`)
 *    — whose work it is, per design call 1b. Falls back to the claimant when a
 *    task has no assignee.
 *  - **merged** → the **claimant/doer** (`claimedByUserId`) — completed work
 *    credits who actually did it, not who it was last assigned to.
 *
 * In the common case these coincide (assigning a task syncs the claim to the new
 * assignee — t1); they diverge only when someone **other than the assignee**
 * started the task (`start_task` moves the claim to the starter, leaving the
 * assignee unchanged).
 *
 * Returns `null` when neither id is set — and since §32 t-89 that is a **first-class
 * state, not a defensive edge**: an `enhancement` is born holding nobody, any task
 * can be released back to the pool, and an erased user leaves the same shape.
 * Callers must render it as nobody's; the Board routes it to the Unassigned lane and
 * deliberately does **not** fall back to the feature owner, which is what kept that
 * lane unreachable until t-89.
 */
export function taskHolderId(
  status: EffectiveStatus,
  claimedByUserId: string | null,
  assigneeUserId: string | null
): string | null {
  return status === 'merged' ? claimedByUserId : (assigneeUserId ?? claimedByUserId);
}
