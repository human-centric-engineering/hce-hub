/**
 * Next.js Middleware
 *
 * Runs before every matched API route. Sunrise uses this layer for one job
 * today — rate limiting — but it's the natural home for any cross-cutting
 * concern that needs to run on every request (e.g., request ID propagation,
 * CORS pre-flight handling, geo-aware redirects).
 *
 * **Rate limiting is enforced here, not in route handlers.** The policy
 * lives in `lib/security/rate-limit-policy.ts`; the dispatcher in
 * `lib/security/rate-limit-middleware.ts` looks up the matching tier and
 * applies the limit. Route handlers MAY layer per-flow sub-caps on top
 * (chat-stream, audio, image, upload, etc.) but MUST NOT call section
 * limiters themselves.
 *
 * **Runtime.** The in-memory LRU limiter (`createRateLimiter`) is Node-only.
 * The `RATE_LIMIT_STORE=redis` configuration switches to an Edge-compatible
 * Redis backend via the async store interface — but the section limiters
 * used by this middleware are still the sync in-memory ones. We therefore
 * pin this middleware to the Node runtime to keep things consistent. Forks
 * deploying to multi-region Edge can swap in the async store + Edge runtime
 * later without touching the policy table.
 *
 * **Matcher.** Only runs on `/api/**` — page routes are server components
 * and don't have the same abuse surface (no input payloads, server-side
 * rendering already throttled by the request pipeline). better-auth's own
 * `/api/auth/**` endpoints ARE included because they're authentication
 * surfaces that need explicit per-IP caps.
 *
 * @see lib/security/rate-limit-policy.ts — the policy table
 * @see lib/security/rate-limit-middleware.ts — the dispatcher
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/security/rate-limit-middleware';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await applyRateLimit(request);
  if (rateLimitResponse) {
    // Re-wrap the bare Response as a NextResponse so downstream middleware /
    // Next.js machinery can inspect / extend it consistently.
    return new NextResponse(rateLimitResponse.body, {
      status: rateLimitResponse.status,
      headers: rateLimitResponse.headers,
    });
  }
  return NextResponse.next();
}

export const config = {
  /**
   * Match every API route. Excludes page routes, static assets, and
   * Next.js internals (_next/*) — those don't need rate-limiting from this
   * layer.
   */
  matcher: ['/api/:path*'],

  /**
   * Pin to the Node runtime. The current section limiters are in-process LRU
   * caches that don't work on the Edge runtime. Switch to `'experimental-edge'`
   * if you migrate to Redis-backed async limiters everywhere.
   */
  runtime: 'nodejs',
};
