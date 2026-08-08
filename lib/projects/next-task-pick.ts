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
