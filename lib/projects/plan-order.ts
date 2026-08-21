/**
 * `planOrder()` — the Plan view's optimal working order (f-plan-view, feature 09).
 *
 * Features are sorted by **status band** (`shipped → in_flight → planning →
 * blocked`) then by **dependency depth** (topological): a feature sits below the
 * deepest chain of features it depends on, so the top of the list is the most
 * ready to advance. This is the design's `planOrder()` (`design/plan.jsx`) as a
 * pure, testable function — the load-bearing surface of t-1 (B27).
 *
 * The ordering is a **recommendation, never enforced** (v1-requirements §3.5/§3.6,
 * exploratory ordering) — nothing gates on it; the user may work any feature out
 * of order.
 *
 * **Cycle-tolerant, never cycle-rejecting.** A malformed dependency set (a self-
 * loop or multi-node cycle) must not loop or throw here — `planOrder` is a *read*
 * and degrades gracefully (a back-edge contributes depth 0). Rejecting cycles is
 * the job of the *writers* that add edges among existing features — `f-intake`'s
 * `persist-features` and `f-sidekick`'s `propose-dependencies` — where the
 * `assertAcyclic` guard is homed (B26 / planning-retro HB4). A read never guards
 * a failure mode it can't fix.
 */

import type { FeatureStatus } from '@prisma/client';

/** The minimal feature shape `planOrder` needs — a subset of `Feature` + its dep ids. */
export interface PlanOrderInput {
  id: string;
  status: FeatureStatus;
  /** Ids of the features this one depends on (`FeatureDependency.dependsOnFeatureId`). */
  dependsOn: string[];
  /**
   * When it shipped (`Feature.shippedAt`, §32 t-79) — orders the **shipped band** by
   * recency (§33-sweep t-60). Optional so every other caller is unaffected; absent or
   * null degrades to the depth ordering below, which is the pre-t-60 behaviour.
   */
  shippedAt?: Date | null;
}

/**
 * Completion order: **oldest first**, with unknown instants at the very top.
 *
 * **Chronological, not most-recent-first** (owner, 2026-08-21). A band renders
 * completed work above work still moving, so a newest-first completed group would put
 * its *oldest* row against the in-flight work — the two ends of the timeline meeting
 * in the middle. Ascending makes the band read as linear history flowing downward, and
 * puts the thing that just finished directly beside the thing being done next. That
 * adjacency is the point, and it is why this is not simply a display preference.
 *
 * Null means "completed before we tracked the instant", so **first** is the truthful
 * place for it — the reading `Task.mergedAt`'s own schema comment already commits to
 * ("NULL ⇒ merged before we tracked it (sorts oldest, which is true)"). Two nulls
 * compare equal and fall through to whatever the caller's next tie-break is, so a set
 * of unstamped rows keeps its incoming order rather than being shuffled.
 *
 * Shared with `plan.ts`'s band interleave so the two orderings cannot disagree about
 * what "completion order" means.
 */
export function byCompletionOrder(a: Date | null | undefined, b: Date | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a.getTime() - b.getTime();
}

/** Sort priority of each status band — lower advances first (design `STATUS_ORDER`). */
const STATUS_BAND: Record<FeatureStatus, number> = {
  shipped: 0,
  in_flight: 1,
  planning: 2,
  blocked: 3,
};

/**
 * Return `features` in Plan-view order (a new array; the input is not mutated).
 * Stable within a `{band, depth}` tie — features keep their incoming order, so
 * pass them in a deterministic order (e.g. `createdAt asc`) for a stable view.
 */
export function planOrder<T extends PlanOrderInput>(features: readonly T[]): T[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const depth = new Map<string, number>();

  // Longest dependency chain rooted at `id`. `seen` breaks cycles per top-level
  // call (a back-edge returns 0); `depth` memoizes across calls. A dep id absent
  // from this feature set (cross-project / dangling edge) contributes nothing.
  const compute = (id: string, seen: Set<string>): number => {
    const memo = depth.get(id);
    if (memo != null) return memo;
    if (seen.has(id)) return 0;
    seen.add(id);
    // `id` is always in `byId`: top-level ids come from `features`, and dep ids
    // are pre-filtered by `byId.has` below — the lookup can't miss.
    const deps = byId.get(id)!.dependsOn.filter((d) => byId.has(d));
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((dep) => compute(dep, seen)));
    depth.set(id, d);
    return d;
  };
  for (const f of features) compute(f.id, new Set());

  return [...features].sort((a, b) => {
    const band = STATUS_BAND[a.status] - STATUS_BAND[b.status];
    if (band !== 0) return band;
    // The SHIPPED band reads in ship order, OLDEST first (§33-sweep t-60).
    // Dependency depth answers "what is ready to advance", which is meaningless for
    // work that is already done — it let a feature shipped this morning sit below one
    // shipped a fortnight ago purely because of its place in the graph.
    //
    // Ascending, so the band reads as linear history: the most recently shipped feature
    // sits at the BOTTOM of the shipped run, directly above the in-flight work it
    // precedes. Newest-first would push the oldest thing you ever shipped up against
    // the thing you are doing today.
    //
    // Only this band. The other three still sort by depth, which is the whole point of
    // the view for work that is still moving.
    //
    // Falling THROUGH to depth on a tie is deliberate: two features with no `shippedAt`
    // (or the same one) keep the depth ordering they had before, so an unstamped set
    // degrades to yesterday's behaviour instead of being reshuffled arbitrarily.
    if (a.status === 'shipped' && b.status === 'shipped') {
      const chronological = byCompletionOrder(a.shippedAt, b.shippedAt);
      if (chronological !== 0) return chronological;
    }
    // Every feature id was assigned a depth by the loop above.
    return depth.get(a.id)! - depth.get(b.id)!;
  });
}
