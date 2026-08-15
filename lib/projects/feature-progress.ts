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
 * **Every exclusion needs a counterpart, or the ratio quietly under-reports**
 * (§32 t-94). `total`/`merged` drop exactly two groups — bugs, and work raised
 * after the ship — so each gets a counter of its own: `openFixes` and
 * `openSinceShip`. That is not a style preference, it is what makes the accounting
 * *closed*, and the closure is asserted directly:
 *
 * ```
 * unmerged.length === (total - merged) + openFixes + openSinceShip
 * ```
 *
 * The three terms are disjoint and exhaustive over the unmerged tasks, so no open
 * task can be invisible — by construction rather than by vigilance. Found the hard
 * way: `live`/`blocked` were unsealed to protect this invariant but key off
 * `active`/`blocked`, so a post-ship enhancement that nobody had *started* matched
 * no counter at all — and since t-89 enhancements are born unassigned, unstarted is
 * their normal state, not an edge.
 *
 * Pure + total (planning-retro B12): reads a task's effective status, kind and
 * creation date, no DB.
 */
import type { TaskKind } from '@prisma/client';
import type { EffectiveStatus } from '@/lib/projects/task-status';

/**
 * A feature's completion progress + its live activity.
 *
 * `total`/`merged` are **sealed** at the ship boundary — a settled historical
 * ratio. `live`/`blocked`/`openFixes` are **not**: they describe what is in
 * flight right now, including work raised after the ship.
 */
export interface FeatureProgress {
  merged: number;
  total: number;
  /** Feature-work being worked right now (effective `active`) — post-ship included. */
  live: number;
  /** Feature-work claimed but waiting on an unmerged dependency — post-ship included. */
  blocked: number;
  /** Open (unmerged) `bug`-kind tasks — the "· N open fixes" surface. */
  openFixes: number;
  /**
   * Open (unmerged) non-`bug` tasks raised **after** the feature shipped (§32 t-94).
   * Always 0 for an unshipped feature, where such work is inside the ratio already.
   *
   * The counterpart `openFixes` has for bugs: `total`/`merged` exclude two groups,
   * and each needs somewhere to be seen or the summary quietly under-reports. This
   * is the **closure term** — the complete count, which `live`/`blocked` may overlap.
   */
  openSinceShip: number;
  /**
   * The subset of `openSinceShip` **nobody has started** — the "· N new" surface.
   *
   * The row renders this rather than `openSinceShip` because `live` and `blocked`
   * already show the started ones, and a shipped feature's ratio has no remainder
   * for them to be a breakdown *of*: `4/4 · 1 live · 1 new` reads as two outstanding
   * items where there is one. (Pre-ship, `live` overlapping the ratio is fine —
   * "3/5 · 1 live" reads as "one of the two remaining is being worked".) So the
   * marker means *post-ship work no other marker is already showing*.
   *
   * The gap t-94 was filed for was exactly this subset: started post-ship work was
   * never invisible, `live`/`blocked` had it. Unstarted work matched nothing — and
   * since t-89 births an enhancement unassigned, unstarted is its normal state.
   */
  unstartedSinceShip: number;
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
  // The exact complement of `builtOut` — everything the completion ratio drops for
  // being raised after the fact. Empty when unshipped, where nothing is post-ship.
  const sinceShip = shippedAt
    ? tasks.filter((t) => t.createdAt.getTime() > shippedAt.getTime())
    : [];
  // Post-ship work still outstanding — bugs excluded, they have `openFixes`.
  const openPostShip = sinceShip.filter((t) => t.kind !== 'bug' && t.status !== 'merged');
  // COMPLETION (`total`/`merged`) is sealed at the boundary — that is the point.
  const completion = builtOut.filter((t) => t.kind !== 'bug');
  // ACTIVITY (`live`/`blocked`/`openFixes`) is NOT sealed, and spans every task.
  // Sealing it too would hide a post-ship enhancement someone is actively working:
  // the row would read "2/2" with no live marker while its own task table listed
  // that task as active — breaking the §09 invariant that a feature's summary can
  // never disagree with the tasks beneath it. `openFixes` already worked this way;
  // the other two now match. What shipped is history; what's in flight is news.
  const activity = tasks.filter((t) => t.kind !== 'bug');
  return {
    total: completion.length,
    merged: completion.filter((t) => t.status === 'merged').length,
    live: activity.filter((t) => t.status === 'active').length,
    blocked: activity.filter((t) => t.status === 'blocked').length,
    openFixes: tasks.filter((t) => t.kind === 'bug' && t.status !== 'merged').length,
    openSinceShip: openPostShip.length,
    // Derived NEGATIVELY — "whatever `live`/`blocked` don't already show" — rather
    // than positively as `status === 'claimed'`. The positive form encodes today's
    // status set, so adding a value to `TaskStatus` (exactly the change t-79 made to
    // `TaskKind`) would drop post-ship work in that state out of EVERY row marker:
    // not live, not blocked, not new. That is the invisible row t-94 exists to
    // prevent, reintroduced by a new enum value. Negated, the row's markers stay
    // disjoint AND exhaustive for any future status, with no behaviour change today.
    unstartedSinceShip: openPostShip.filter((t) => t.status !== 'active' && t.status !== 'blocked')
      .length,
  };
}
