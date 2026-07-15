/**
 * Unit: consumer project reads (f-projects).
 *
 * Load-bearing assertions (the funnel's first consumer-API caller, B27):
 *   - the list scopes via `accessibleProjectIds` (only member projects);
 *   - `getProjectForUser` goes through `getAccessibleProject`, so a non-member
 *     / unknown id surfaces as NotFoundError (→ 404, never 403).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/projects/access', () => ({
  accessibleProjectIds: vi.fn(),
  getAccessibleProject: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    project: { findMany: vi.fn() },
    projectMember: { findMany: vi.fn() },
    feature: { count: vi.fn() },
    task: { count: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const { accessibleProjectIds, getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { listProjectsForUser, getProjectForUser } = await import('@/lib/projects/consumer');

const scopeIds = accessibleProjectIds as ReturnType<typeof vi.fn>;
const getAccessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const projFindMany = prisma.project.findMany as ReturnType<typeof vi.fn>;
const memberFindMany = prisma.projectMember.findMany as ReturnType<typeof vi.fn>;
const featureCount = prisma.feature.count as ReturnType<typeof vi.fn>;
const taskCount = prisma.task.count as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('listProjectsForUser', () => {
  it('scopes to the funnel ids and enriches lead + counts', async () => {
    scopeIds.mockResolvedValue(['p1']);
    projFindMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Hub',
        hostPlatform: 'sunrise',
        status: 'active',
        createdAt: new Date('2026-07-15'),
        leadUserId: 'u1',
        _count: { members: 2, features: 5 },
      },
    ]);
    userFindMany.mockResolvedValue([{ id: 'u1', name: 'Ada', email: 'a@x.io', image: null }]);

    const cards = await listProjectsForUser('u1');

    expect(scopeIds).toHaveBeenCalledWith('u1');
    expect(projFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p1'] } } })
    );
    expect(cards[0]).toMatchObject({ memberCount: 2, featureCount: 5, lead: { name: 'Ada' } });
  });

  it('short-circuits to [] with no DB hit when the user has no projects', async () => {
    scopeIds.mockResolvedValue([]);
    const cards = await listProjectsForUser('nobody');
    expect(cards).toEqual([]);
    expect(projFindMany).not.toHaveBeenCalled();
  });

  it('renders a null lead gracefully', async () => {
    scopeIds.mockResolvedValue(['p1']);
    projFindMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Hub',
        hostPlatform: 'sunrise',
        status: 'planning',
        createdAt: new Date(),
        leadUserId: null,
        _count: { members: 1, features: 0 },
      },
    ]);
    userFindMany.mockResolvedValue([]);
    const cards = await listProjectsForUser('u1');
    expect(cards[0].lead).toBeNull();
    expect(userFindMany).not.toHaveBeenCalled();
  });
});

describe('getProjectForUser', () => {
  it('returns the enriched view for a member (members + counts + null-user render)', async () => {
    getAccessible.mockResolvedValue({
      id: 'p1',
      name: 'Hub',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: [],
      leadUserId: 'u1',
      createdAt: new Date('2026-07-15'),
    });
    memberFindMany.mockResolvedValue([
      { userId: 'u1', role: 'lead', addedAt: new Date() },
      { userId: 'erased', role: 'member', addedAt: new Date() },
    ]);
    featureCount.mockResolvedValue(3);
    taskCount.mockResolvedValue(7);
    userFindMany.mockResolvedValue([{ id: 'u1', name: 'Ada', email: 'a@x.io', image: null }]);

    const view = await getProjectForUser('u1', 'p1');

    expect(getAccessible).toHaveBeenCalledWith('u1', 'p1');
    expect(view).toMatchObject({ featureCount: 3, taskCount: 7, memberCount: 2 });
    expect(view.lead?.name).toBe('Ada');
    expect(view.members.find((m) => m.userId === 'erased')?.user).toBeNull();
  });

  it('renders a null lead (erased) without a lead lookup id', async () => {
    getAccessible.mockResolvedValue({
      id: 'p1',
      name: 'Hub',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: [],
      leadUserId: null,
      createdAt: new Date(),
    });
    memberFindMany.mockResolvedValue([{ userId: 'm1', role: 'member', addedAt: new Date() }]);
    featureCount.mockResolvedValue(0);
    taskCount.mockResolvedValue(0);
    userFindMany.mockResolvedValue([{ id: 'm1', name: 'Bo', email: 'b@x.io', image: null }]);

    const view = await getProjectForUser('m1', 'p1');

    expect(view.lead).toBeNull();
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['m1'] } } })
    );
  });

  it('propagates the funnel NotFoundError for a non-member / unknown id (→ 404, never 403)', async () => {
    getAccessible.mockRejectedValue(new NotFoundError('Project p9 not found'));
    await expect(getProjectForUser('u1', 'p9')).rejects.toBeInstanceOf(NotFoundError);
    expect(memberFindMany).not.toHaveBeenCalled();
  });
});
