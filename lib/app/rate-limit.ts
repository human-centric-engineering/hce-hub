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
 * **240/min** is 20 project tabs at the 5s interval — far past any real session,
 * while still stopping a runaway poller dead. It is deliberately derived from the
 * interval rather than picked: if t-126 ships a different cadence, this number
 * moves with it.
 */
const REVISION_POLL_INTERVAL_SECONDS = 5;
const REVISION_CONCURRENT_TABS = 20;
const REVISION_REQUESTS_PER_MINUTE =
  (60 / REVISION_POLL_INTERVAL_SECONDS) * REVISION_CONCURRENT_TABS;

const revisionLimiter = createRateLimiter({
  interval: SECURITY_CONSTANTS.RATE_LIMIT.DEFAULT_INTERVAL,
  maxRequests: REVISION_REQUESTS_PER_MINUTE,
  uniqueTokenPerInterval: SECURITY_CONSTANTS.RATE_LIMIT.MAX_UNIQUE_TOKENS,
});

export function registerAppRateLimits(): void {
  registerRateLimitTier('hub-revision', revisionLimiter);
  // Anchored on both ends: `[^/]+` is one path segment, and `$` stops the rule
  // reaching anything nested below `/revision`. App rules splice in after every
  // Sunrise rule and before the catch-all, so this wins over the `api` tier for
  // this path and nothing else.
  registerRateLimitRule({
    match: /^\/api\/v1\/projects\/[^/]+\/revision$/,
    tier: 'hub-revision',
    key: 'session-user',
  });
}
