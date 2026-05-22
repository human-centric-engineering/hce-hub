/**
 * Unit Tests: Auth Guards (withAuth, withAdminAuth)
 *
 * Tests higher-order functions that wrap API route handlers with authentication
 * and authorization checks. These guards eliminate duplicated session/role
 * boilerplate across route handlers.
 *
 * Test Coverage:
 * - withAuth: Authentication verification, handler invocation, error handling
 * - withAdminAuth: Authentication + admin role verification, error handling
 * - Route handlers with and without dynamic params
 * - Error propagation through handleAPIError
 * - Response forwarding from handlers
 *
 * Key Behaviors:
 * - Returns 401 (UNAUTHORIZED) when session is null
 * - Returns 403 (FORBIDDEN) when user lacks admin role (withAdminAuth only)
 * - Passes authenticated session to handler
 * - Correctly handles route params context (TParams generic)
 * - Wraps handler errors with handleAPIError
 * - Returns the Response from handler on success
 *
 * @see lib/auth/guards.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { withAuth, withAdminAuth, type AuthSession } from '@/lib/auth/guards';
import { UnauthorizedError, ForbiddenError } from '@/lib/api/errors';
import { RATE_LIMIT_TIERS } from '@/lib/security/rate-limit';
import { SECURITY_CONSTANTS } from '@/lib/security/constants';

/**
 * Mock dependencies
 */

// Mock Next.js headers
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

// Mock auth config
vi.mock('@/lib/auth/config', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Import mocked modules
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/config';

/**
 * Test helpers
 */

/** Dummy request for handler invocation (auth is mocked via headers) */
const createRequest = (url = 'http://localhost:3000/api/test'): NextRequest => {
  return new NextRequest(url);
};

/**
 * Create mock session matching AuthSession interface.
 * Pass `id` to use a non-default user ID (e.g. for multi-user bucket tests).
 */
function createMockSession(
  role: 'USER' | 'ADMIN' | null = 'USER',
  id = 'user_test123'
): AuthSession {
  return {
    session: {
      id: 'session_test123',
      userId: id,
      token: 'mock_token',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user: {
      id,
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: true,
      image: null,
      role: role,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

/**
 * Parse JSON response helper
 */
async function parseResponse<T = unknown>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}

/**
 * Response type interfaces
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Test Suite: withAuth
 */
describe('withAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock headers
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  describe('Authentication Checks', () => {
    it('should return 401 when auth.api.getSession returns null', async () => {
      // Arrange
      vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

      const handler = vi.fn(async () => {
        return Response.json({ success: true, data: 'test' });
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toBe('Unauthorized');

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass authenticated session to handler when session exists', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async (_request: NextRequest, session: AuthSession) => {
        return Response.json({ success: true, data: { userId: session.user.id } });
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<SuccessResponse<{ userId: string }>>(response);

      // Assert
      expect(response.status).toBe(200);
      // test-review:accept tobe_true — structural assertion on the API response envelope's success field, paired with status 200 and data.userId checks
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe(mockSession.user.id);

      // Handler should be called with request and session
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(request, mockSession);
    });

    it('should work with USER role', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async (_request: NextRequest, session: AuthSession) => {
        return Response.json({ success: true, data: { role: session.user.role } });
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<SuccessResponse<{ role: string }>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(data.data.role).toBe('USER');
    });

    it('should work with ADMIN role', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async (_request: NextRequest, session: AuthSession) => {
        return Response.json({ success: true, data: { role: session.user.role } });
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<SuccessResponse<{ role: string }>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(data.data.role).toBe('ADMIN');
    });
  });

  describe('Handler Invocation', () => {
    it('should receive (request, session) arguments correctly', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async (_request: NextRequest, session: AuthSession) => {
        // Verify arguments are correct types
        expect(_request).toBeInstanceOf(NextRequest);
        expect(session).toHaveProperty('user');
        expect(session).toHaveProperty('session');
        return Response.json({ success: true, data: 'ok' });
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      await wrappedHandler(request);

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(request, mockSession);
    });

    it('should receive (request, session, context) when route has params', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(
        async (
          _request: NextRequest,
          _session: AuthSession,
          context: { params: Promise<{ id: string }> }
        ) => {
          const params = await context.params;
          return Response.json({ success: true, data: { id: params.id } });
        }
      );

      const wrappedHandler = withAuth<{ id: string }>(handler);
      const request = createRequest();
      const context = { params: Promise.resolve({ id: 'test-123' }) };

      // Act
      const response = await wrappedHandler(request, context);
      const data = await parseResponse<SuccessResponse<{ id: string }>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(data.data.id).toBe('test-123');

      // Handler should be called with request, session, and context
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(request, mockSession, context);
    });

    it('should handle complex route params', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      type RouteParams = { userId: string; postId: string };

      const handler = vi.fn(
        async (
          _request: NextRequest,
          _session: AuthSession,
          context: { params: Promise<RouteParams> }
        ) => {
          const params = await context.params;
          return Response.json({
            success: true,
            data: { userId: params.userId, postId: params.postId },
          });
        }
      );

      const wrappedHandler = withAuth<RouteParams>(handler);
      const request = createRequest();
      const context = { params: Promise.resolve({ userId: 'user-1', postId: 'post-2' }) };

      // Act
      const response = await wrappedHandler(request, context);
      const data = await parseResponse<SuccessResponse<RouteParams>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(data.data.userId).toBe('user-1');
      expect(data.data.postId).toBe('post-2');
    });

    it('should return the Response from the handler on success', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const expectedResponse = Response.json(
        { success: true, data: { message: 'custom response' } },
        { status: 201, headers: { 'X-Custom': 'header' } }
      );

      const handler = vi.fn(async () => expectedResponse);

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);

      // Assert
      expect(response.status).toBe(201);
      expect(response.headers.get('X-Custom')).toBe('header');

      const data = await parseResponse<SuccessResponse<{ message: string }>>(response);
      expect(data.data.message).toBe('custom response');
    });
  });

  describe('Error Handling', () => {
    it('should wrap handler errors with handleAPIError', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const testError = new Error('Handler crashed');
      const handler = vi.fn(async () => {
        throw testError;
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert - handleAPIError should return 500 for unknown errors
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('Handler crashed');
    });

    it('should handle UnauthorizedError thrown by handler', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => {
        throw new UnauthorizedError('Custom auth error');
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toBe('Custom auth error');
    });

    it('should handle ForbiddenError thrown by handler', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => {
        throw new ForbiddenError('Custom forbidden error');
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Custom forbidden error');
    });

    it('should handle session fetch errors', async () => {
      // Arrange
      vi.mocked(auth.api.getSession).mockRejectedValue(new Error('Session service down'));

      const handler = vi.fn(async () => {
        return Response.json({ success: true, data: 'test' });
      });

      const wrappedHandler = withAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Session service down');

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();
    });
  });
});

/**
 * Test Suite: withAdminAuth
 */
describe('withAdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock headers
    vi.mocked(headers).mockResolvedValue(new Headers());

    // Reset rate-limit buckets for the standard test user.
    // vi.clearAllMocks() does NOT touch the LRU cache — without this, successful
    // admin calls in the suite consume from the shared admin:admin:user:user_test123
    // bucket and will breach the 30/min cap as the suite grows.
    RATE_LIMIT_TIERS.admin.reset('admin:admin:user:user_test123');
    RATE_LIMIT_TIERS.orchestration.reset('admin:orchestration:user:user_test123');
  });

  describe('Authentication Checks', () => {
    it('should return 401 when auth.api.getSession returns null', async () => {
      // Arrange
      vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

      const handler = vi.fn(async () => {
        return Response.json({ success: true, data: 'admin data' });
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toBe('Unauthorized');

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Authorization Checks', () => {
    it('should return 403 with "Admin access required" when user role is not ADMIN', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => {
        return Response.json({ success: true, data: 'admin data' });
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Admin access required');

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return 403 for role USER', async () => {
      // Arrange
      const mockSession = createMockSession('USER');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => {
        return Response.json({ success: true, data: 'admin data' });
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Admin access required');
    });

    it('should return 403 when user role is null', async () => {
      // Arrange
      const mockSession = createMockSession(null);
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => {
        return Response.json({ success: true, data: 'admin data' });
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(403);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Admin access required');
    });

    it('should pass authenticated admin session to handler', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async (_request: NextRequest, session: AuthSession) => {
        return Response.json({ success: true, data: { userId: session.user.id } });
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<SuccessResponse<{ userId: string }>>(response);

      // Assert
      expect(response.status).toBe(200);
      // test-review:accept tobe_true — structural assertion on the API response envelope's success field, paired with status 200 and data.userId checks
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe(mockSession.user.id);

      // Handler should be called with request and session
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(request, mockSession);
    });
  });

  describe('Handler Invocation', () => {
    it('should receive (request, session) arguments correctly', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async (_request: NextRequest, session: AuthSession) => {
        // Verify arguments are correct types
        expect(_request).toBeInstanceOf(NextRequest);
        expect(session).toHaveProperty('user');
        expect(session).toHaveProperty('session');
        expect(session.user.role).toBe('ADMIN');
        return Response.json({ success: true, data: 'ok' });
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      await wrappedHandler(request);

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(request, mockSession);
    });

    it('should receive (request, session, context) when route has params', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(
        async (
          _request: NextRequest,
          _session: AuthSession,
          context: { params: Promise<{ id: string }> }
        ) => {
          const params = await context.params;
          return Response.json({ success: true, data: { id: params.id } });
        }
      );

      const wrappedHandler = withAdminAuth<{ id: string }>(handler);
      const request = createRequest();
      const context = { params: Promise.resolve({ id: 'admin-123' }) };

      // Act
      const response = await wrappedHandler(request, context);
      const data = await parseResponse<SuccessResponse<{ id: string }>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(data.data.id).toBe('admin-123');

      // Handler should be called with request, session, and context
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(request, mockSession, context);
    });

    it('should return the Response from the handler on success', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const expectedResponse = Response.json(
        { success: true, data: { stats: 'admin stats' } },
        { status: 200, headers: { 'X-Admin': 'true' } }
      );

      const handler = vi.fn(async () => expectedResponse);

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Admin')).toBe('true');

      const data = await parseResponse<SuccessResponse<{ stats: string }>>(response);
      expect(data.data.stats).toBe('admin stats');
    });
  });

  describe('Error Handling', () => {
    it('should wrap handler errors with handleAPIError', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const testError = new Error('Admin handler crashed');
      const handler = vi.fn(async () => {
        throw testError;
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert - handleAPIError should return 500 for unknown errors
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INTERNAL_ERROR');
      expect(data.error.message).toBe('Admin handler crashed');
    });

    it('should handle UnauthorizedError thrown by handler', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => {
        throw new UnauthorizedError('Session expired');
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toBe('Session expired');
    });

    it('should handle ForbiddenError thrown by handler', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => {
        throw new ForbiddenError('Insufficient permissions');
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('Insufficient permissions');
    });

    it('should handle session fetch errors', async () => {
      // Arrange
      vi.mocked(auth.api.getSession).mockRejectedValue(new Error('Auth service unavailable'));

      const handler = vi.fn(async () => {
        return Response.json({ success: true, data: 'admin data' });
      });

      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Act
      const response = await wrappedHandler(request);
      const data = await parseResponse<ErrorResponse>(response);

      // Assert
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Auth service unavailable');

      // Handler should not be called
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle async params context', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN');
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(
        async (
          _request: NextRequest,
          _session: AuthSession,
          context: { params: Promise<{ id: string }> }
        ) => {
          // Simulate async params processing
          const params = await context.params;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return Response.json({ success: true, data: { id: params.id } });
        }
      );

      const wrappedHandler = withAdminAuth<{ id: string }>(handler);
      const request = createRequest();
      const context = { params: Promise.resolve({ id: 'async-123' }) };

      // Act
      const response = await wrappedHandler(request, context);
      const data = await parseResponse<SuccessResponse<{ id: string }>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(data.data.id).toBe('async-123');
    });
  });
});

// =============================================================================
// Rate-limit integration for withAdminAuth
// =============================================================================

/**
 * Helper: reset both tier buckets for a given user ID.
 * Mirrors the token format: `admin:${tier}:user:${userId}`.
 */
function resetTierBuckets(userId: string): void {
  RATE_LIMIT_TIERS.admin.reset(`admin:admin:user:${userId}`);
  RATE_LIMIT_TIERS.orchestration.reset(`admin:orchestration:user:${userId}`);
}

/**
 * Helper: call a wrapped admin handler N times with an ADMIN session.
 * All calls share the same request object (session is resolved via the mock).
 * Returns the last response.
 */
async function exhaustBucket(
  wrappedHandler: (request: NextRequest) => Promise<Response>,
  request: NextRequest,
  count: number
): Promise<Response> {
  let last!: Response;
  for (let i = 0; i < count; i++) {
    last = await wrappedHandler(request);
  }
  return last;
}

/**
 * Test Suite: withAdminAuth — rate limiting
 *
 * Uses REAL RATE_LIMIT_TIERS (not mocked). The entire point of this suite is
 * to verify that withAdminAuth integrates correctly with the real limiter
 * registry — a mocked registry would prove nothing.
 *
 * Token format verified against guards.ts: `admin:${tier}:user:${session.user.id}`
 */
describe('withAdminAuth — rate limiting', () => {
  const DEFAULT_USER_ID = 'user_test123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(new Headers());
    // Reset both tier buckets for the standard test user on each test.
    resetTierBuckets(DEFAULT_USER_ID);
  });

  // ---------------------------------------------------------------------------
  // Test 1: Default tier is 'admin' — 31st request in a minute returns 429
  // ---------------------------------------------------------------------------
  it("default tier 'admin': 31st request returns 429 with standard error envelope", async () => {
    // Arrange
    const mockSession = createMockSession('ADMIN', DEFAULT_USER_ID);
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

    const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
    // withAdminAuth with no options — should default to 'admin' tier (30/min)
    const wrappedHandler = withAdminAuth(handler);
    const request = createRequest();

    // Act: exhaust the 30-request admin budget
    const lastSuccessful = await exhaustBucket(wrappedHandler, request, 30);
    expect(lastSuccessful.status).toBe(200); // sanity: bucket not yet exhausted

    // Call #31
    const response = await wrappedHandler(request);
    const data = await parseResponse<ErrorResponse>(response);

    // Assert: wrapper enforced the 30/min cap and returned the standard 429 envelope
    expect(response.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(data.error.message).toBeTruthy();
    // Retry-After header must be present and be a positive integer string
    const retryAfter = response.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Explicit 'orchestration' tier — 30 calls all succeed (cap is 120)
  // ---------------------------------------------------------------------------
  it("explicit { rateLimit: 'orchestration' }: 30 calls all succeed (orchestration cap is 120)", async () => {
    // Arrange
    const mockSession = createMockSession('ADMIN', DEFAULT_USER_ID);
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

    const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
    // Opts into the orchestration tier explicitly
    const wrappedHandler = withAdminAuth(handler, { rateLimit: 'orchestration' });
    const request = createRequest();

    // Act: make 30 calls — all should succeed because orchestration cap is 120, not 30
    const responses: Response[] = [];
    for (let i = 0; i < 30; i++) {
      responses.push(await wrappedHandler(request));
    }

    // Assert: the wrapper routed to the orchestration tier; none of the 30 calls were rejected
    for (const response of responses) {
      expect(response.status).toBe(200);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 3: Tier buckets are independent
  // ---------------------------------------------------------------------------
  it('tier buckets are independent: exhausting orchestration does not affect admin tier', async () => {
    // Arrange
    const mockSession = createMockSession('ADMIN', DEFAULT_USER_ID);
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

    const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
    const orchWrapped = withAdminAuth(handler, { rateLimit: 'orchestration' });
    const adminWrapped = withAdminAuth(handler);
    const request = createRequest();

    // Act: exhaust the orchestration bucket (120 calls)
    await exhaustBucket(orchWrapped, request, 120);

    // Verify orchestration is now exhausted
    const orchBlocked = await orchWrapped(request);
    expect(orchBlocked.status).toBe(429); // sanity: orchestration bucket is exhausted

    // Act: make a single request through the admin-tier wrapper
    const adminResponse = await adminWrapped(request);

    // Assert: admin bucket is independent — this should be the first admin-tier call, so it succeeds
    expect(adminResponse.status).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Two distinct user IDs do not share a bucket
  // ---------------------------------------------------------------------------
  it('two distinct user IDs have independent buckets: exhausting user A does not affect user B', async () => {
    // Arrange
    const userAId = 'user_a_distinct';
    const userBId = 'user_b_distinct';
    resetTierBuckets(userAId);
    resetTierBuckets(userBId);

    const sessionA = createMockSession('ADMIN', userAId);
    const sessionB = createMockSession('ADMIN', userBId);
    const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
    const request = createRequest();

    // Exhaust user A's bucket
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionA as never);
    const wrappedA = withAdminAuth(handler);
    await exhaustBucket(wrappedA, request, 30);
    const blockedA = await wrappedA(request);
    expect(blockedA.status).toBe(429); // sanity: user A is rate-limited

    // Act: make user B's first request
    vi.mocked(auth.api.getSession).mockResolvedValue(sessionB as never);
    const wrappedB = withAdminAuth(handler);
    const responseB = await wrappedB(request);

    // Assert: user B has their own bucket — should succeed
    expect(responseB.status).toBe(200);

    // Cleanup: reset both user-specific buckets
    resetTierBuckets(userAId);
    resetTierBuckets(userBId);
  });

  // ---------------------------------------------------------------------------
  // Test 5: 401 path does NOT consume the rate-limit budget
  // ---------------------------------------------------------------------------
  it('401 (unauthenticated) path does not consume rate-limit budget', async () => {
    // Arrange: no session
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
    const wrappedHandler = withAdminAuth(handler);
    const request = createRequest();

    // Act: make 5 unauthenticated calls
    const responses: Response[] = [];
    for (let i = 0; i < 5; i++) {
      responses.push(await wrappedHandler(request));
    }

    // Assert: all 5 return 401
    for (const response of responses) {
      expect(response.status).toBe(401);
    }

    // Assert: admin bucket for user_test123 is untouched — peek without consuming
    // (the 401 path short-circuits before the rate-limit check, so no budget is consumed)
    const bucketState = RATE_LIMIT_TIERS.admin.peek(`admin:admin:user:${DEFAULT_USER_ID}`);
    expect(bucketState.remaining).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // Test 6: 403 path does NOT consume the rate-limit budget
  // ---------------------------------------------------------------------------
  it('403 (non-admin role) path does not consume rate-limit budget', async () => {
    // Arrange: USER role (non-admin), using a distinct ID to avoid cross-test collision
    const nonAdminId = 'user_other_non_admin';
    resetTierBuckets(nonAdminId);

    const userSession = createMockSession('USER', nonAdminId);
    vi.mocked(auth.api.getSession).mockResolvedValue(userSession as never);

    const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
    const wrappedHandler = withAdminAuth(handler);
    const request = createRequest();

    // Act: make 5 calls with a non-admin user
    const responses: Response[] = [];
    for (let i = 0; i < 5; i++) {
      responses.push(await wrappedHandler(request));
    }

    // Assert: all 5 return 403
    for (const response of responses) {
      expect(response.status).toBe(403);
    }

    // Assert: admin bucket for the non-admin user is untouched — the wrapper
    // short-circuits on the 403 BEFORE the rate-limit check
    const bucketState = RATE_LIMIT_TIERS.admin.peek(`admin:admin:user:${nonAdminId}`);
    expect(bucketState.remaining).toBe(30);

    // Cleanup
    resetTierBuckets(nonAdminId);
  });

  // ---------------------------------------------------------------------------
  // Test 7: 429 response includes standard rate-limit headers
  // ---------------------------------------------------------------------------
  it('429 response includes X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After headers', async () => {
    // Arrange
    const mockSession = createMockSession('ADMIN', DEFAULT_USER_ID);
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

    const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
    const wrappedHandler = withAdminAuth(handler);
    const request = createRequest();

    // Act: exhaust the admin bucket then capture the 429
    await exhaustBucket(wrappedHandler, request, 30);
    const response = await wrappedHandler(request); // call #31

    // Assert: status
    expect(response.status).toBe(429);

    // Assert: rate-limit headers are present and valid
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

    const resetHeader = response.headers.get('X-RateLimit-Reset');
    expect(resetHeader).not.toBeNull();
    expect(Number.isFinite(Number(resetHeader))).toBe(true);
    expect(Number(resetHeader)).toBeGreaterThan(0);

    const retryAfter = response.headers.get('Retry-After');
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Sliding window — after the interval, requests are allowed again
  // ---------------------------------------------------------------------------
  describe('sliding window reset', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      resetTierBuckets(DEFAULT_USER_ID);
    });

    it('allows requests again after the rate-limit window expires', async () => {
      // Arrange
      const mockSession = createMockSession('ADMIN', DEFAULT_USER_ID);
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never);

      const handler = vi.fn(async () => Response.json({ success: true, data: 'ok' }));
      const wrappedHandler = withAdminAuth(handler);
      const request = createRequest();

      // Exhaust the admin bucket
      await exhaustBucket(wrappedHandler, request, 30);

      // Confirm it's exhausted
      const blockedResponse = await wrappedHandler(request);
      expect(blockedResponse.status).toBe(429);

      // Act: advance time past the sliding window interval
      vi.advanceTimersByTime(SECURITY_CONSTANTS.RATE_LIMIT.DEFAULT_INTERVAL + 1000);

      // Make another request — the window has expired, so it should be allowed
      const postWindowResponse = await wrappedHandler(request);

      // Assert: the sliding window reset allowed the request through
      expect(postWindowResponse.status).toBe(200);
    });
  });
});
