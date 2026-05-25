/**
 * Integration Test: Admin Orchestration — Conversations List
 *
 * GET /api/v1/admin/orchestration/conversations
 *
 * @see app/api/v1/admin/orchestration/conversations/route.ts
 *
 * Key assertions:
 * - Admin auth required (401/403 otherwise)
 * - Always scoped to session.user.id (matches detail/PATCH/DELETE)
 * - Any userId query param is ignored
 * - Optional filters (agentId, isActive, q, dateFrom, dateTo) work correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/admin/orchestration/conversations/route';
import {
  mockAdminUser,
  mockAuthenticatedUser,
  mockUnauthenticatedUser,
} from '@/tests/helpers/auth';

// ─── Mock dependencies ───────────────────────────────────────────────────────

vi.mock('@/lib/auth/config', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiConversation: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// ─── Imports after mocks ─────────────────────────────────────────────────────

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ADMIN_ID = 'cmjbv4i3x00003wsloputgwul';
const AGENT_ID = 'cmjbv4i3x00003wsloputgwu2';
const CONV_ID = 'cmjbv4i3x00003wsloputgwu3';
const USER_ID = 'cmjbv4i3x00003wsloputgwu5';

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONV_ID,
    userId: ADMIN_ID,
    agentId: AGENT_ID,
    title: 'Test Conversation',
    isActive: true,
    metadata: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    _count: { messages: 5 },
    ...overrides,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/v1/admin/orchestration/conversations');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

async function parseJson<T>(response: Response): Promise<T> {
  return JSON.parse(await response.text()) as T;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/orchestration/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication & Authorization', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockUnauthenticatedUser());

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(401);
    });

    it('returns 403 when authenticated as non-admin', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAuthenticatedUser('USER'));

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(403);
    });
  });

  // Helper: extract the most-recent `where` clause passed to findMany.
  // The route may wrap the visibility OR in an AND when filters are
  // present; tests use this + the helpers below to assert on the
  // structured clause without coupling to literal AND/OR nesting.
  function getWhere(): unknown {
    const call = vi.mocked(prisma.aiConversation.findMany).mock.calls.at(-1);
    return (call?.[0] as { where?: unknown } | undefined)?.where;
  }

  // Returns true when the visibility clause grants access to the
  // owner (one of the OR branches matches `{ userId }`).
  function visibilityIncludesOwner(where: unknown, userId: string): boolean {
    const visibility = extractVisibility(where);
    return (
      Array.isArray(visibility?.OR) &&
      visibility.OR.some(
        (b) => typeof b === 'object' && b !== null && (b as { userId?: string }).userId === userId
      )
    );
  }

  function extractVisibility(where: unknown): { OR?: unknown[] } | null {
    if (where === null || typeof where !== 'object') return null;
    const w = where as { OR?: unknown[]; AND?: unknown[] };
    if (Array.isArray(w.OR)) return w;
    if (Array.isArray(w.AND)) {
      for (const clause of w.AND) {
        const v = extractVisibility(clause);
        if (v) return v;
      }
    }
    return null;
  }

  // Returns true when one of the AND-filter clauses (the non-visibility
  // siblings) deep-matches the given partial constraint.
  function filtersInclude(where: unknown, constraint: Record<string, unknown>): boolean {
    if (where === null || typeof where !== 'object') return false;
    const w = where as { AND?: unknown[] };
    if (!Array.isArray(w.AND)) return false;
    for (const clause of w.AND) {
      if (clause === null || typeof clause !== 'object') continue;
      if (deepMatch(clause as Record<string, unknown>, constraint)) return true;
    }
    return false;
  }

  function deepMatch(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(expected)) {
      if (!(k in actual)) return false;
      const av = actual[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        if (av === null || typeof av !== 'object') return false;
        if (!deepMatch(av as Record<string, unknown>, v as Record<string, unknown>)) return false;
      } else if (av !== v) return false;
    }
    return true;
  }

  describe('Session scoping', () => {
    it('always scopes to session.user.id (owner branch of the visibility OR)', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest());

      expect(visibilityIncludesOwner(getWhere(), ADMIN_ID)).toBe(true);
    });

    it('also allows actively-shared conversations (second OR branch)', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest());

      const visibility = extractVisibility(getWhere());
      const shareBranch = visibility?.OR?.find(
        (b) => typeof b === 'object' && b !== null && 'share' in (b as Record<string, unknown>)
      );
      expect(shareBranch).toBeDefined();
    });

    it('ignores userId query param — stays scoped to session user', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ userId: USER_ID }));

      expect(visibilityIncludesOwner(getWhere(), ADMIN_ID)).toBe(true);
      // The hostile userId from the query string never appears.
      expect(visibilityIncludesOwner(getWhere(), USER_ID)).toBe(false);
    });
  });

  describe('Successful listing', () => {
    it('returns paginated conversations list for admin', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([
        makeConversation(),
        makeConversation({ id: 'cmjbv4i3x00003wsloputgwu4' }),
      ] as never);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(2);

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(200);
      const data = await parseJson<{ success: boolean; data: unknown[]; meta: unknown }>(response);
      // test-review:accept tobe_true — structural boolean assertion on API response field
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.meta).toBeDefined();
    });

    it('returns empty array when no conversations exist', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      const response = await GET(makeGetRequest());

      expect(response.status).toBe(200);
      const data = await parseJson<{ success: boolean; data: unknown[] }>(response);
      expect(data.data).toHaveLength(0);
    });
  });

  describe('Filtering', () => {
    it('passes agentId filter', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ agentId: AGENT_ID }));

      expect(filtersInclude(getWhere(), { agentId: AGENT_ID })).toBe(true);
    });

    it('passes isActive=true (string) as boolean true', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ isActive: 'true' }));

      expect(filtersInclude(getWhere(), { isActive: true })).toBe(true);
    });

    it('passes isActive=false (string) as boolean false', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ isActive: 'false' }));

      expect(filtersInclude(getWhere(), { isActive: false })).toBe(true);
    });

    it('passes title search q', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ q: 'test chat' }));

      expect(filtersInclude(getWhere(), { title: { contains: 'test chat' } })).toBe(true);
    });

    it('passes messageSearch as message content filter', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ messageSearch: 'error handling' }));

      expect(
        filtersInclude(getWhere(), {
          messages: { some: { content: { contains: 'error handling', mode: 'insensitive' } } },
        })
      ).toBe(true);
    });

    it('applies both q and messageSearch when both provided', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ q: 'support', messageSearch: 'error' }));

      expect(filtersInclude(getWhere(), { title: { contains: 'support' } })).toBe(true);
      expect(
        filtersInclude(getWhere(), {
          messages: { some: { content: { contains: 'error', mode: 'insensitive' } } },
        })
      ).toBe(true);
    });

    it('passes dateFrom as gte filter on updatedAt', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ dateFrom: '2025-01-01T00:00:00Z' }));

      // The gte is a Date instance — assert structure not value.
      const where = getWhere();
      const w = where as { AND?: Array<{ updatedAt?: { gte?: unknown } }> };
      const dateClause = w.AND?.find((c) => c?.updatedAt && 'gte' in c.updatedAt);
      expect(dateClause?.updatedAt?.gte).toBeInstanceOf(Date);
    });
  });

  describe('Agent relation included', () => {
    it('includes agent select and message count in query', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest());

      expect(vi.mocked(prisma.aiConversation.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            agent: { select: { id: true, name: true, slug: true } },
            _count: { select: { messages: true } },
          },
        })
      );
    });
  });

  describe('Pagination', () => {
    it('applies page and limit to skip/take', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockAdminUser());
      vi.mocked(prisma.aiConversation.findMany).mockResolvedValue([]);
      vi.mocked(prisma.aiConversation.count).mockResolvedValue(0);

      await GET(makeGetRequest({ page: '2', limit: '5' }));

      expect(vi.mocked(prisma.aiConversation.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 })
      );
    });
  });
});
