/**
 * App rate-limit registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: the rate-limit middleware imports and calls this once at module
 * load (middleware runtime). Add `registerRateLimitTier()` /
 * `registerRateLimitRule()` calls — registration is namespace-scoped and fails
 * fast (it throws if a rule could shadow a Sunrise-protected surface).
 *
 * Full guide + example: CUSTOMIZATION.md §4 · .context/security/rate-limiting.md
 *
 * ---
 *
 * **HCE Hub (fork): one registration.** See `.context/app/platform-divergences.md`.
 */
import { createRateLimiter, registerRateLimitTier } from '@/lib/security/rate-limit';
import { registerRateLimitRule } from '@/lib/security/rate-limit-policy';
import { SECURITY_CONSTANTS } from '@/lib/security/constants';

/**
 * `/api/v1/projects/:id/revision` is **polled**, and the default `api` tier is a
 * single 100/min budget shared across every `/api/v1` call the same user makes
 * (`CATCH_ALL_RULE`). Left on that tier, live surfaces would spend the budget the
 * rest of the app needs: at the 5s interval f-realtime uses, one open project tab
 * is 12 req/min, so four tabs eat half of it and claiming a task mid-session
 * starts returning 429 — the app rate-limiting *itself* out of working
 * (`/code-review` on t-125).
 *
 * A separate bucket is the fix, not a bigger shared one: polling and acting must
 * not be able to starve each other in either direction.
 *
 * The cap is **derived, not picked** — if t-126 ships a different cadence, it moves
 * with it — and it carries a deliberate 2× headroom, because polling is not the
 * only traffic a poller makes. `useAutoRefresh` fires once on mount and again on
 * every `visibilitychange`, so a user switching between tabs generates requests
 * *off* the cadence; add a retry after a network blip and the steady-state
 * arithmetic understates real load.
 *
 * The headroom matters more than the exact number because **a 429 here is silent**.
 * A poller has no user-visible failure mode: surfaces simply stop updating, with
 * nothing on screen and nothing in a log to say why. That asymmetry — too high
 * merely delays stopping a runaway, too low silently breaks the feature — is why
 * the first version of this (exactly 20 tabs, zero margin) was wrong (`/code-review`
 * round 2). **t-126 should still treat a 429 as a real state** and back off rather
 * than hammering a closed door.
 */
const REVISION_POLL_INTERVAL_SECONDS = 5;
const REVISION_CONCURRENT_TABS = 20;
/** Off-cadence polls: mount, every `visibilitychange`, and post-blip retries. */
const REVISION_HEADROOM = 2;
const REVISION_REQUESTS_PER_MINUTE =
  (60 / REVISION_POLL_INTERVAL_SECONDS) * REVISION_CONCURRENT_TABS * REVISION_HEADROOM;

const revisionLimiter = createRateLimiter({
  interval: SECURITY_CONSTANTS.RATE_LIMIT.DEFAULT_INTERVAL,
  maxRequests: REVISION_REQUESTS_PER_MINUTE,
  uniqueTokenPerInterval: SECURITY_CONSTANTS.RATE_LIMIT.MAX_UNIQUE_TOKENS,
});

/**
 * Hoisted for the same reason `revisionLimiter` is: **`registerRateLimitRule`
 * dedupes by reference** (`appRules.includes(rule)`). A literal built inside the
 * function is a fresh object every call, so the dedupe could never fire — and this
 * function is called on module load, which Next re-runs on every HMR invalidation
 * of the middleware. Each save would append another copy of the same rule, and
 * `getEffectiveRateLimitPolicy()` would reallocate a longer array each time. It
 * also made `defaults.test.ts`'s `toHaveLength(1)` depend on whether some other
 * suite in the same worker had already imported the middleware (`/code-review`
 * round 2).
 *
 * Anchored on both ends: `[^/]+` is one path segment, and `$` stops the rule
 * reaching anything nested below `/revision`. App rules splice in after every
 * Sunrise rule and before the catch-all, so this wins over the `api` tier for this
 * path and nothing else.
 */
const revisionRule = {
  match: /^\/api\/v1\/projects\/[^/]+\/revision$/,
  tier: 'hub-revision',
  key: 'session-user',
} as const;

export function registerAppRateLimits(): void {
  registerRateLimitTier('hub-revision', revisionLimiter);
  registerRateLimitRule(revisionRule);
}
