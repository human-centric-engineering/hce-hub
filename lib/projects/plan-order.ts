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
    // Every feature id was assigned a depth by the loop above.
    return depth.get(a.id)! - depth.get(b.id)!;
  });
}
