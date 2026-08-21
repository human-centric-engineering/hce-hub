/**
 * Tests: the Hub's rate-limit registrations (fork-owned)
 *
 * `tests/unit/lib/app/defaults.test.ts` pins this seam too, but that file is
 * **Sunrise-owned** and the pin is a divergence — a sync conflict could quietly
 * lose it. This file is fork-owned, so it cannot be resolved away by an upstream
 * merge, and it asserts the thing that actually matters at request time rather
 * than the shape of the registration: **which tier a revision poll resolves to.**
 *
 * The bug being guarded against has no symptom until it bites. On the shared `api`
 * tier the endpoint works perfectly — right up to the moment a user with several
 * tabs open finds that claiming a task 429s, because their own polling spent the
 * budget. Nothing fails at build or in a unit test; it surfaces as the app
 * intermittently refusing to work under normal use.
 *
 * @see lib/app/rate-limit.ts · .context/app/platform-divergences.md row 26
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { registerAppRateLimits } from '@/lib/app/rate-limit';
import { findRateLimitRule, getEffectiveRateLimitPolicy } from '@/lib/security/rate-limit-policy';
import { resolveRateLimitTier } from '@/lib/security/rate-limit';

const REVISION_PATH = '/api/v1/projects/cmjbv4i3x00003wsloputgwul/revision';

beforeAll(() => {
  // Idempotent by design (HMR re-runs it), so calling it here is safe even if
  // another suite in this worker already did.
  registerAppRateLimits();
});

describe('Hub rate-limit registrations', () => {
  it('routes a revision poll to its own tier, not the shared api budget', () => {
    const rule = findRateLimitRule(REVISION_PATH);

    expect(rule?.tier).toBe('hub-revision');
    expect(rule?.key).toBe('session-user');
  });

  it('leaves every sibling project route on the shared api tier', () => {
    // The rule is anchored at both ends. An unanchored version would pull `/plan`
    // and `/board` into the polling bucket, which is the opposite of the point:
    // those are human-triggered and belong on the budget they share with writes.
    for (const path of [
      '/api/v1/projects/cmjbv4i3x00003wsloputgwul/plan',
      '/api/v1/projects/cmjbv4i3x00003wsloputgwul/board',
      '/api/v1/projects/cmjbv4i3x00003wsloputgwul/events',
      '/api/v1/projects/cmjbv4i3x00003wsloputgwul/revision/nested',
    ]) {
      expect(findRateLimitRule(path)?.tier, path).toBe('api');
    }
  });

  it('registers the tier it names, so the middleware can resolve it', () => {
    // A rule naming an unregistered tier fails OPEN — the middleware logs and
    // applies no limit at all. The platform has a boot-time integrity check for
    // exactly this; asserting it here means a typo is caught by the suite too.
    expect(resolveRateLimitTier('hub-revision')).toBeDefined();
  });

  it('gives the poller headroom beyond its own steady-state cadence', () => {
    // 480/min = 20 open project tabs at the 5s interval, doubled. The doubling is
    // the point, not padding: `useAutoRefresh` polls on mount AND on every
    // `visibilitychange`, so tab-switching generates requests off the cadence that
    // the steady-state arithmetic does not count. The first version of this cap was
    // exactly 20 × 12 = 240, which left a 20-tab user with zero margin
    // (`/code-review` round 2).
    //
    // Pinned because the number is derived: if the cadence changes and this does
    // not move with it, the derivation has silently stopped being true.
    const limiter = resolveRateLimitTier('hub-revision');
    expect(limiter).toBeDefined();

    const key = 'session-user:test-headroom';
    let allowed = 0;
    for (let i = 0; i < 500; i++) {
      if (limiter?.check(key).success) allowed++;
    }
    expect(allowed).toBe(480);
  });

  it('registers one rule however many times it is called', () => {
    // `registerRateLimitRule` dedupes by REFERENCE, so a rule built as a literal
    // inside `registerAppRateLimits` could never be deduped — and the function runs
    // on every HMR invalidation of the middleware, appending a copy each time.
    // Asserting on repeat calls is what pins the hoist; asserting the shape once
    // would pass either way (`/code-review` round 2).
    const before = findRateLimitRule(REVISION_PATH);

    registerAppRateLimits();
    registerAppRateLimits();

    const policy = getEffectiveRateLimitPolicy();
    const revisionRules = policy.filter((rule) => rule.tier === 'hub-revision');

    expect(revisionRules).toHaveLength(1);
    // And still the same rule object the first registration installed.
    expect(findRateLimitRule(REVISION_PATH)).toBe(before);
  });
});
