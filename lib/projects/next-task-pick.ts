/**
 * Bug-bias pick for `next_task` (f-bug-handling §22-02).
 *
 * Given the caller's pullable tasks already in priority order (oldest-ready
 * first), prefer a `bug`-kind task over feature-work of *equal readiness* — a
 * strong bias, never an override. Only tasks that are already pullable (every
 * dependency merged) reach here, so a dependency-blocked bug is never chosen:
 * the bias floats bugs up the ready set, it does not jump the dependency queue.
 * Pure + total, so it unit-tests without a DB (planning-retro B12).
 */
import type { TaskKind } from '@prisma/client';

/**
 * Return the preferred task from an already-ordered list of pullable tasks: the
 * first `bug`-kind one if any, else the first (the existing oldest-ready pick).
 * `undefined` when the list is empty.
 */
export function pickBiasedTask<T extends { kind: TaskKind }>(
  pullableOrdered: readonly T[]
): T | undefined {
  return pullableOrdered.find((t) => t.kind === 'bug') ?? pullableOrdered[0];
}

/**
 * The **focus policy**: own work before the commons (f-work-kinds §32 t-90).
 *
 * Since t-89 a task can be held by nobody, so `next_task`'s pool is no longer just
 * "your work" — it is your work *plus the commons*, the unclaimed pool any member
 * may pull from. This decides which of the two you are handed.
 *
 * **Own work wins whenever any of it is ready.** "Own" is deliberately wide (owner
 * call): a feature you own, *and* any task currently held by you on someone else's
 * feature. Most work in the Hub is selected rather than dealt — you claim a feature,
 * claim an enhancement, or take a task from a feature someone else claimed — and a
 * task you have deliberately taken is the most owned thing there is. Without the
 * second half, pulling from the pool would make the task vanish from the very tool
 * that offered it, while the Board still showed it in your lane.
 *
 * **The bug bias applies *within* the chosen tier, not across both.** So an
 * unclaimed bug on somebody else's feature will not interrupt your own ready work.
 * That is the deliberate trade, not an oversight: the active-fixes strip is
 * project-scoped and already shows every open bug to everyone, so a bug sweep is a
 * thing you *choose to go and do*, not something `next_task` should push at you
 * mid-feature.
 *
 * **This is a static default with a known future.** It is the first cut of what
 * `futures.md#dynamic-focus-and-prioritisation` describes as declared bias rather
 * than a stored priority field: the right pick genuinely differs between "heads-down
 * on my feature" (today's default) and "doing a bug sweep". When that lands, the
 * tier order becomes the parameter — which is why the policy is one named function
 * over a ready set rather than a `where` clause, and why the caller supplies
 * `isOwnWork` rather than this module knowing about users.
 *
 * Pure + total, so it unit-tests without a DB (planning-retro B12).
 *
 * @param pullableOrdered  tasks already filtered to pullable and in priority order
 * @param isOwnWork        whether a task counts as the caller's own
 */
export function pickFocusedTask<T extends { kind: TaskKind }>(
  pullableOrdered: readonly T[],
  isOwnWork: (task: T) => boolean
): T | undefined {
  const own: T[] = [];
  const commons: T[] = [];
  for (const task of pullableOrdered) {
    (isOwnWork(task) ? own : commons).push(task);
  }
  // Partitioning preserves the incoming order, so each tier stays oldest-ready-first.
  return pickBiasedTask(own.length > 0 ? own : commons);
}
