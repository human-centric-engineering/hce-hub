/**
 * Derived feature status (f-status-model §20 t-37; blocked overlay t-39).
 *
 * The feature-level twin of `computeEffectiveStatus` (`task-status.ts`): a
 * feature's *stored* `status` never carries the word "planning" to the UI. Status
 * is derived from **readiness** — an unshipped dependency makes a feature
 * `blocked` (carrying the deps it waits on, the "blocked · waiting on `<dep>`"
 * reason), whether it's un-started *or* claimed and part-built (the t-39 overlay:
 * work isn't linear, so a claimed feature can become blocked mid-flight). With no
 * unshipped dep, a claimed feature is `in_flight` and an un-started one
 * `available`; `shipped` passes through. So every read surface (Plan, feature
 * page) agrees, and the static "planning" pill is gone.
 *
 * Pure + total: no DB, no I/O — it takes a stored status + the loaded dependency
 * statuses and returns a verdict, so it's trivially testable and can't diverge
 * across callers. Ordering is unaffected — `planOrder` still bands on the *stored*
 * status; this is a presentation-layer derivation only.
 */
import type { FeatureStatus } from '@prisma/client';

/**
 * A feature's *effective*, readiness-aware status. The stored `planning` label is
 * replaced by `available` / `blocked`; the reserved-but-unused stored `blocked`
 * (the parked external-dependency model) folds into the derived `blocked` too.
 */
export type EffectiveFeatureStatus = 'available' | 'blocked' | 'in_flight' | 'shipped';

/** The minimal dependency shape the derivation reads (a depended-on feature). */
export interface FeatureStatusDep {
  status: FeatureStatus;
  slug: string | null;
  title: string;
}

/** A dependency an un-started feature is waiting on (i.e. not yet shipped). */
export interface WaitingOnRef {
  slug: string | null;
  title: string;
}

/** The derived verdict: the effective status + (when blocked) what it waits on. */
export interface EffectiveFeatureResult {
  status: EffectiveFeatureStatus;
  /** Unshipped dependencies — non-empty **iff** `status === 'blocked'`. */
  waitingOn: WaitingOnRef[];
}

/**
 * Derive a feature's effective status from its stored status + dependency
 * statuses. `shipped` passes through. For **any other** state — un-started
 * (`planning`/reserved `blocked`) *or* claimed (`in_flight`) — an unshipped
 * dependency makes it **`blocked`** (naming the deps it waits on); this is the
 * `blocked` overlay (owner, 2026-08-03): product work isn't linear, so a feature
 * claimed and part-built can discover it needs another piece shipped first and
 * *become* blocked mid-flight — mirroring nothing, this is a deliberate divergence
 * from the task model (a `claimed` task blocks, but an `active` one doesn't). With
 * no unshipped dep, a claimed feature is `in_flight`, an un-started one `available`.
 */
export function computeFeatureStatus(
  stored: FeatureStatus,
  deps: readonly FeatureStatusDep[]
): EffectiveFeatureResult {
  if (stored === 'shipped') return { status: 'shipped', waitingOn: [] };

  // Any unshipped dependency blocks the feature — claimed or not (the overlay).
  const waitingOn = deps
    .filter((d) => d.status !== 'shipped')
    .map((d) => ({ slug: d.slug, title: d.title }));
  if (waitingOn.length > 0) return { status: 'blocked', waitingOn };

  // Nothing outstanding: a claimed feature is being worked; an un-started one is
  // ready to pick up.
  return stored === 'in_flight'
    ? { status: 'in_flight', waitingOn: [] }
    : { status: 'available', waitingOn: [] };
}
