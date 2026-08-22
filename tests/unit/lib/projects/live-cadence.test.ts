/**
 * Tests: the shared poll cadence (f-realtime §36)
 *
 * One number with two consumers that must agree — the client's poll interval and
 * the `hub-revision` rate-limit cap derived from it. They were written out
 * separately for one commit, with a comment in one file promising they moved
 * together and nothing making that true (`/code-review`).
 *
 * The interesting assertion is the last one: it walks from the cadence to the cap
 * the middleware actually enforces, so halving the interval fails here rather than
 * silently 429-ing every poller in production — a failure with no user-visible
 * symptom, on a surface whose whole job is to update quietly.
 *
 * @see lib/projects/live-cadence.ts · lib/app/rate-limit.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  PROJECT_POLL_INTERVAL_MS,
  PROJECT_POLL_INTERVAL_SECONDS,
} from '@/lib/projects/live-cadence';
import { registerAppRateLimits } from '@/lib/app/rate-limit';
import { resolveRateLimitTier } from '@/lib/security/rate-limit';

beforeAll(() => registerAppRateLimits());

describe('the shared poll cadence', () => {
  it('states the same interval in both units', () => {
    expect(PROJECT_POLL_INTERVAL_SECONDS).toBe(PROJECT_POLL_INTERVAL_MS / 1000);
  });

  it('leaves the rate-limit cap enough room for 20 tabs at this cadence, doubled', () => {
    // The derivation the rate-limit seam claims to make, checked end to end against
    // the limiter the middleware will actually use — not against a copy of the sum.
    const pollsPerMinutePerTab = 60 / PROJECT_POLL_INTERVAL_SECONDS;
    const expected = pollsPerMinutePerTab * 20 * 2;

    const limiter = resolveRateLimitTier('hub-revision');
    expect(limiter).toBeDefined();

    const key = 'session-user:cadence-derivation';
    let allowed = 0;
    for (let i = 0; i < expected + 20; i++) {
      if (limiter?.check(key).success) allowed++;
    }
    expect(allowed).toBe(expected);
  });
});
