/**
 * Tests for `lib/projects/ideas.ts` — the Ideas inbox read. Pins the funnel
 * (deny propagates as NotFoundError), the open+dropped scope (promoted excluded),
 * newest-first order, and DTO mapping (resolved author → UserRef|null, ISO dates).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { idea: { findMany: vi.fn() } } }));
vi.mock('@/lib/projects/user-refs', () => ({ fetchUsers: vi.fn() }));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { fetchUsers } = await import('@/lib/projects/user-refs');
const { NotFoundError } = await import('@/lib/api/errors');
const { getProjectIdeas } = await import('@/lib/projects/ideas');

const access = getAccessibleProject as ReturnType<typeof vi.fn>;
const findMany = prisma.idea.findMany as ReturnType<typeof vi.fn>;
const users = fetchUsers as ReturnType<typeof vi.fn>;

const USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ id: 'p1' });
  findMany.mockResolvedValue([]);
  users.mockResolvedValue(new Map());
});

describe('getProjectIdeas', () => {
  it('propagates the funnel NotFoundError for a non-member / unknown project', async () => {
    access.mockRejectedValue(new NotFoundError('nope'));
    await expect(getProjectIdeas(USER, 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reads open + dropped only (promoted excluded), newest first, scoped to the project', async () => {
    await getProjectIdeas(USER, 'p1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', status: { in: ['open', 'dropped'] } },
        orderBy: { createdAt: 'desc' },
      })
    );
  });

  it('maps rows to the DTO: resolved author, ISO dates, null triagedAt while open', async () => {
    const created = new Date('2026-08-01T10:00:00.000Z');
    findMany.mockResolvedValue([
      {
        id: 'i1',
        text: 'a jot',
        status: 'open',
        createdByUserId: 'u1',
        createdAt: created,
        triagedAt: null,
      },
    ]);
    users.mockResolvedValue(
      new Map([['u1', { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null }]])
    );

    const { ideas } = await getProjectIdeas(USER, 'p1');
    expect(ideas).toEqual([
      {
        id: 'i1',
        text: 'a jot',
        status: 'open',
        createdBy: { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
        createdAt: '2026-08-01T10:00:00.000Z',
        triagedAt: null,
      },
    ]);
  });

  it('renders an erased / unknown author as null, and serialises triagedAt for a dropped idea', async () => {
    findMany.mockResolvedValue([
      {
        id: 'i2',
        text: 'archived',
        status: 'dropped',
        createdByUserId: 'gone',
        createdAt: new Date('2026-08-02T00:00:00.000Z'),
        triagedAt: new Date('2026-08-03T00:00:00.000Z'),
      },
    ]);
    users.mockResolvedValue(new Map()); // author no longer exists

    const { ideas } = await getProjectIdeas(USER, 'p1');
    expect(ideas[0].createdBy).toBeNull();
    expect(ideas[0].triagedAt).toBe('2026-08-03T00:00:00.000Z');
    // Only existing author ids are looked up (nulls filtered out).
    expect(users).toHaveBeenCalledWith(['gone']);
  });
});
