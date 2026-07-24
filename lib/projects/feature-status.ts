/**
 * Derived feature status (f-status-model §20 t-37).
 *
 * The feature-level twin of `computeEffectiveStatus` (`task-status.ts`): a
 * feature's *stored* `status` never carries the word "planning" to the UI. An
 * un-started feature's status is derived from **readiness** — `available` when
 * every dependency has shipped, else `blocked`, carrying the unshipped
 * dependencies it waits on (the "blocked · waiting on `<dep>`" reason). A claimed
 * (`in_flight`) or `shipped` feature passes straight through. So every read
 * surface (Plan, feature page) agrees, and the static "planning" pill is gone.
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
 * statuses. `in_flight`/`shipped` pass through unchanged; any other stored value
 * (`planning`, or the reserved `blocked`) is an *un-started* feature whose
 * readiness is computed: all deps shipped → `available`, else `blocked` naming
 * the unshipped ones.
 */
export function computeFeatureStatus(
  stored: FeatureStatus,
  deps: readonly FeatureStatusDep[]
): EffectiveFeatureResult {
  if (stored === 'shipped') return { status: 'shipped', waitingOn: [] };
  if (stored === 'in_flight') return { status: 'in_flight', waitingOn: [] };

  // Un-started: an unshipped dependency blocks it (and names the reason).
  const waitingOn = deps
    .filter((d) => d.status !== 'shipped')
    .map((d) => ({ slug: d.slug, title: d.title }));

  return waitingOn.length === 0
    ? { status: 'available', waitingOn: [] }
    : { status: 'blocked', waitingOn };
}
