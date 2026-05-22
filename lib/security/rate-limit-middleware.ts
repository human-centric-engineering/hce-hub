/**
 * Rate-Limit Middleware Dispatcher
 *
 * Consumed by `middleware.ts` at the project root. Runs on every API request,
 * looks up the matching tier from {@link RATE_LIMIT_POLICY}, identifies the
 * caller, applies the section limiter, and returns a 429 response if the cap
 * is exceeded — otherwise yields control back to the route handler.
 *
 * Route handlers must NOT call section limiters themselves. They MAY call
 * tighter *per-flow* limiters (chatLimiter, audioLimiter, etc.) as additive
 * checks on expensive sub-flows.
 *
 * **Test bypass.** Setting `RATE_LIMIT_BYPASS=true` makes `applyRateLimit`
 * a no-op. `tests/setup.ts` sets this so the vast majority of unit tests
 * never have to think about rate-limiting. Tests that explicitly exercise
 * the middleware (or a section tier) unset the env var in their own
 * `beforeEach` and reset the limiter state per test.
 *
 * @see lib/security/rate-limit-policy.ts — the policy table this consumes
 * @see lib/security/rate-limit.ts — limiter primitives + the tier registry
 * @see middleware.ts — project-root Next.js wiring
 */

import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getClientIP } from '@/lib/security/ip';
import {
  RATE_LIMIT_TIERS,
  createRateLimitResponse,
  type RateLimiter,
} from '@/lib/security/rate-limit';
import {
  findRateLimitRule,
  type RateLimitKey,
  type RateLimitRule,
} from '@/lib/security/rate-limit-policy';

/**
 * Apply the rate-limit policy to an incoming request.
 *
 * Returns a `Response` (status 429) when the cap is exceeded; the caller
 * MUST return that response immediately and skip further middleware /
 * handler execution. Returns `null` when the request is allowed to proceed.
 *
 * Order of operations:
 *   1. Bypass check (`RATE_LIMIT_BYPASS=true` env var, used by the test suite).
 *   2. Find the first matching policy rule. No match → no rate limit.
 *   3. Run the rule's `skip` predicate (if any). True → no rate limit.
 *   4. Build the rate-limit token via the rule's key strategy. Session
 *      resolution happens only for `'session-user'` rules and falls back
 *      to IP if there's no session.
 *   5. Check the section limiter for that token. Allowed → return `null`.
 *      Exceeded → return the standard 429 response with `Retry-After` and
 *      `X-RateLimit-*` headers.
 *
 * Failure modes:
 *   - If session resolution throws (better-auth outage, DB down) we DO NOT
 *     fail-open: we fall back to IP keying so the request still gets a
 *     bucket. The route handler will surface the underlying error.
 *   - If the rule's tier isn't in `RATE_LIMIT_TIERS` (unreachable in
 *     practice — the type system enforces this) we treat it as "no limit"
 *     and log a warning. Open vs closed default here is open: a missing
 *     tier should not break production traffic, only telemetry.
 */
export async function applyRateLimit(request: NextRequest): Promise<Response | null> {
  if (isBypassEnabled()) return null;

  const rule = findRateLimitRule(request.nextUrl.pathname);
  if (!rule) return null;
  if (rule.skip && rule.skip(request)) return null;

  const limiter: RateLimiter | undefined = RATE_LIMIT_TIERS[rule.tier];
  if (!limiter) {
    // Unreachable under normal type-checked code; defensive.
    return null;
  }

  const token = await buildToken(rule, request);
  const result = limiter.check(token);
  if (!result.success) {
    return createRateLimitResponse(result);
  }
  return null;
}

/**
 * Whether the test/dev bypass is active. Set `RATE_LIMIT_BYPASS=true` in the
 * environment to short-circuit `applyRateLimit`. Used by `tests/setup.ts` so
 * the vast majority of unit tests never have to think about rate-limiting.
 *
 * The check is intentionally permissive — any non-falsy value enables the
 * bypass — because the consumers (test setup, dev .env.local) treat it as a
 * boolean flag, not a structured config.
 */
function isBypassEnabled(): boolean {
  const raw = process.env.RATE_LIMIT_BYPASS;
  return raw === 'true' || raw === '1';
}

/**
 * Build the rate-limit token (LRU cache key) for a given rule + request.
 *
 * Tokens are namespaced by tier and key strategy so different sections
 * don't share buckets, and so the middleware's section tokens don't
 * collide with per-flow sub-limiter tokens that route handlers may build
 * with their own conventions (e.g. `audio:user:...`).
 *
 * Format: `mw:${tier}:${key-strategy}:${identifier}`.
 */
async function buildToken(rule: RateLimitRule, request: NextRequest): Promise<string> {
  const id = await resolveIdentifier(rule.key, request);
  return `mw:${rule.tier}:${rule.key}:${id}`;
}

/**
 * Resolve the per-request identifier for the chosen key strategy.
 *
 * - `'ip'` returns the client IP.
 * - `'session-user'` resolves the better-auth session and returns the user
 *   ID. Falls back to `ip:${IP}` if no session (typical for routes the
 *   user hasn't authenticated to yet — they still get a per-IP bucket so
 *   anonymous traffic can't grief authenticated buckets).
 * - `'api-key'` extracts the API key hash from `Authorization: Bearer <key>`.
 *   Falls back to IP if missing.
 * - `'embed-token'` extracts the embed token from the `X-Embed-Token` header
 *   (and combines with IP, mirroring the existing `embed:user:${token}:${ip}`
 *   convention used by the embed chat limiter). Falls back to IP if missing.
 *
 * IP fallback exists because rate-limiting is best-effort defense in depth —
 * if we can't identify the caller more precisely, we still want *some* bucket
 * rather than letting the request through unlimited.
 */
async function resolveIdentifier(key: RateLimitKey, request: NextRequest): Promise<string> {
  const ip = getClientIP(request);

  switch (key) {
    case 'ip':
      return ip;

    case 'session-user': {
      try {
        const session = await auth.api.getSession({ headers: request.headers });
        if (session?.user?.id) return `user:${session.user.id}`;
      } catch {
        // Session resolution failed (auth provider hiccup, DB down). Fall
        // back to IP so we still apply some cap instead of failing open.
      }
      return `ip:${ip}`;
    }

    case 'api-key': {
      const header = request.headers.get('authorization');
      if (header) {
        // `Authorization: Bearer <key>` — use the key value as the bucket
        // identifier. Hashing happens inside the API-key resolution layer;
        // for rate-limiting we just need a stable per-key string.
        const match = /^Bearer\s+(.+)$/i.exec(header.trim());
        if (match?.[1]) return `key:${match[1]}`;
      }
      return `ip:${ip}`;
    }

    case 'embed-token': {
      const token = request.headers.get('x-embed-token');
      if (token) return `embed:${token}:${ip}`;
      return `ip:${ip}`;
    }
  }
}
