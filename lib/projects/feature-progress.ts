/**
 * Feature-completion progress, sealed at the ship boundary (f-bug-handling
 * §22-02; ship boundary added by f-work-kinds §32 t-79).
 *
 * **Completion is a historical fact, not a live ratio.** Once a feature ships,
 * what it took to build it is settled — so any task created *after* `shippedAt`
 * is off the completion axis **regardless of kind**. That is what lets a
 * task-sized improvement be filed honestly as `enhancement` on the feature it
 * improves instead of masquerading as a `bug` to avoid denting the bar, and it
 * means a future kind can't silently break completion the way a new value would
 * have when accounting hung off the enum.
 *
 * A **null `shippedAt` counts every task** — exactly today's behaviour — so
 * unshipped features, and any feature whose ship date couldn't be resolved,
 * degrade safely rather than reading as complete.
 *
 * `bug` keeps its own accounting *before* the boundary: a defect found during
 * build-out isn't build-out, so it stays out of `merged`/`total`/`live`/`blocked`
 * and is tallied as `openFixes` instead — an open bug must never make a shipped
 * feature read "3/4 merged". `openFixes` deliberately spans the whole set,
 * pre- and post-ship: an open fix is open whenever it was raised.
 *
 * Pure + total (planning-retro B12): reads a task's effective status, kind and
 * creation date, no DB.
 */
import type { TaskKind } from '@prisma/client';
import type { EffectiveStatus } from '@/lib/projects/task-status';

/** A feature's completion progress + its open-fixes count. */
export interface FeatureProgress {
  merged: number;
  total: number;
  /** Feature-work tasks actively being worked (effective `active`). */
  live: number;
  /** Feature-work tasks claimed but waiting on an unmerged dependency. */
  blocked: number;
  /** Open (unmerged) `bug`-kind tasks — the "· N open fixes" surface. */
  openFixes: number;
}

/** The minimal task shape progress reads: effective status, kind, and when it was raised. */
export interface ProgressTaskInput {
  status: EffectiveStatus;
  kind: TaskKind;
  /** Used against the feature's `shippedAt` to place the task on or off the completion axis. */
  createdAt: Date;
}

/**
 * Compute progress: completion counts over the work the feature was built from,
 * with open bugs tallied separately as `openFixes`.
 *
 * `shippedAt` is the feature's ship boundary — pass `null` for a feature that
 * hasn't shipped (or whose date is unknown), which counts every task.
 */
export function computeFeatureProgress(
  tasks: readonly ProgressTaskInput[],
  shippedAt: Date | null = null
): FeatureProgress {
  // `<=` so a task created in the same transaction as the ship still counts as
  // build-out; only work raised strictly afterwards falls off the axis.
  const builtOut = shippedAt
    ? tasks.filter((t) => t.createdAt.getTime() <= shippedAt.getTime())
    : tasks;
  const work = builtOut.filter((t) => t.kind !== 'bug');
  return {
    total: work.length,
    merged: work.filter((t) => t.status === 'merged').length,
    live: work.filter((t) => t.status === 'active').length,
    blocked: work.filter((t) => t.status === 'blocked').length,
    // Spans every task, not just the built-out set — a post-ship defect is still
    // an open fix, and suppressing it here would hide exactly what the strip exists to show.
    openFixes: tasks.filter((t) => t.kind === 'bug' && t.status !== 'merged').length,
  };
}
