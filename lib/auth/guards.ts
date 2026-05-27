/**
 * API Route Auth Guards
 *
 * Higher-order functions that wrap API route handlers with authentication
 * and authorization checks. Eliminates duplicated session/role boilerplate
 * across route handlers.
 *
 * Usage:
 * ```typescript
 * // Admin-only route
 * export const GET = withAdminAuth(async (request, session) => {
 *   // session is guaranteed to be an authenticated admin
 *   return successResponse({ data: '...' });
 * });
 *
 * // Any authenticated user
 * export const GET = withAuth(async (request, session) => {
 *   return successResponse({ user: session.user });
 * });
 * ```
 *
 * Error handling is automatic — handlers don't need try/catch for auth
 * or unhandled errors. All errors are routed through handleAPIError.
 */

import { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/config';
import { UnauthorizedError, ForbiddenError, handleAPIError } from '@/lib/api/errors';
import { resolveApiKey, hasScope } from '@/lib/auth/api-keys';

/**
 * Session type from better-auth (matches AuthSession in utils.ts)
 */
export interface AuthSession {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    role?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Next.js route params context shape
 */
interface RouteContext<TParams = Record<string, string>> {
  params: Promise<TParams>;
}

/**
 * Wrap an API route handler with authentication.
 *
 * - Retrieves the session from better-auth
 * - Throws UnauthorizedError (401) if no session
 * - Passes the session to the handler
 * - Catches all errors via handleAPIError
 *
 * @example
 * ```typescript
 * // Simple authenticated route (no params)
 * export const GET = withAuth(async (request, session) => {
 *   const user = await prisma.user.findUnique({ where: { id: session.user.id } });
 *   return successResponse(user);
 * });
 *
 * // Route with dynamic params
 * export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
 *   const { id } = await params;
 *   return successResponse({ id });
 * });
 * ```
 */
export function withAuth(
  handler: (request: NextRequest, session: AuthSession) => Response | Promise<Response>
): (request: NextRequest) => Promise<Response>;

export function withAuth<TParams>(
  handler: (
    request: NextRequest,
    session: AuthSession,
    context: RouteContext<TParams>
  ) => Response | Promise<Response>
): (request: NextRequest, context: RouteContext<TParams>) => Promise<Response>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAuth(handler: (...args: any[]) => Response | Promise<Response>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]): Promise<Response> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [request, context] = args;

      // API-key fallback (Phase 4): if a valid `Authorization: Bearer sk_...`
      // header resolves to an active key, treat its owner as the session.
      // The CI eval-gate flow uses this so headless callers don't need a
      // browser cookie. Any scope is accepted at this layer; per-endpoint
      // scope enforcement lives in the handler when needed.
      const apiKey = await resolveApiKey(request as NextRequest);
      if (apiKey) {
        if (context !== undefined) return await handler(request, apiKey.session, context);
        return await handler(request, apiKey.session);
      }

      const requestHeaders = await headers();
      const session = await auth.api.getSession({ headers: requestHeaders });

      if (!session) {
        throw new UnauthorizedError();
      }

      if (context !== undefined) {
        return await handler(request, session, context);
      }
      return await handler(request, session);
    } catch (error) {
      return handleAPIError(error);
    }
  };
}

/**
 * Wrap an API route handler with admin authentication.
 *
 * - Retrieves the session from better-auth
 * - Throws UnauthorizedError (401) if no session
 * - Throws ForbiddenError (403) if user role is not ADMIN
 * - Passes the session to the handler
 * - Catches all errors via handleAPIError
 *
 * Rate limiting is NOT applied here. The project enforces rate limits in
 * `proxy.ts` via the central policy table at `lib/security/rate-limit-policy.ts`.
 * Route handlers should not call limiters directly except for additive
 * per-flow caps (e.g., `chatLimiter`, `audioLimiter`, `imageLimiter` for
 * the chat-stream route's expensive sub-flows).
 *
 * @example
 * ```typescript
 * // Admin-only route (no params)
 * export const GET = withAdminAuth(async (request, session) => {
 *   const stats = await getSystemStats();
 *   return successResponse(stats);
 * });
 *
 * // Admin route with dynamic params
 * export const DELETE = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
 *   const { id } = await params;
 *   await prisma.user.delete({ where: { id } });
 *   return successResponse({ id, deleted: true });
 * });
 * ```
 */
export function withAdminAuth(
  handler: (request: NextRequest, session: AuthSession) => Response | Promise<Response>
): (request: NextRequest) => Promise<Response>;

export function withAdminAuth<TParams>(
  handler: (
    request: NextRequest,
    session: AuthSession,
    context: RouteContext<TParams>
  ) => Response | Promise<Response>
): (request: NextRequest, context: RouteContext<TParams>) => Promise<Response>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAdminAuth(handler: (...args: any[]) => Response | Promise<Response>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]): Promise<Response> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [request, context] = args;

      // API-key fallback (Phase 4): admin-scoped keys can hit admin
      // endpoints headlessly. The user behind the key needs neither
      // `role: 'ADMIN'` nor an active session cookie — the scope is the
      // capability check. Any key without `admin` scope is rejected
      // here with 403 rather than falling through to the cookie path
      // (which would 401 a key-bearing caller and confuse CI).
      const apiKey = await resolveApiKey(request as NextRequest);
      if (apiKey) {
        if (!hasScope(apiKey.scopes, 'admin')) {
          throw new ForbiddenError('Admin scope required');
        }
        if (context !== undefined) return await handler(request, apiKey.session, context);
        return await handler(request, apiKey.session);
      }

      const requestHeaders = await headers();
      const session = await auth.api.getSession({ headers: requestHeaders });

      if (!session) {
        throw new UnauthorizedError();
      }

      if (session.user.role !== 'ADMIN') {
        throw new ForbiddenError('Admin access required');
      }

      if (context !== undefined) {
        return await handler(request, session, context);
      }
      return await handler(request, session);
    } catch (error) {
      return handleAPIError(error);
    }
  };
}
