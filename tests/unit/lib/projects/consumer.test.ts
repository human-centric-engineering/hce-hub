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
  getAccessibleProjectByRef: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    project: { findMany: vi.fn() },
    projectMember: { findMany: vi.fn() },
    feature: { count: vi.fn() },
    task: { count: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const { accessibleProjectIds, getAccessibleProjectByRef } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { listProjectsForUser, getProjectForUser } = await import('@/lib/projects/consumer');

const scopeIds = accessibleProjectIds as ReturnType<typeof vi.fn>;
const getAccessible = getAccessibleProjectByRef as ReturnType<typeof vi.fn>;
const projFindMany = prisma.project.findMany as ReturnType<typeof vi.fn>;
const memberFindMany = prisma.projectMember.findMany as ReturnType<typeof vi.fn>;
const featureCount = prisma.feature.count as ReturnType<typeof vi.fn>;
const taskCount = prisma.task.count as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no open bug tasks → an empty active-bugs strip. Tests that assert
  // the strip override this.
  taskFindMany.mockResolvedValue([]);
});

describe('listProjectsForUser', () => {
  it('scopes to the funnel ids and enriches lead + counts', async () => {
    scopeIds.mockResolvedValue(['p1']);
    projFindMany.mockResolvedValue([
      {
        id: 'p1',
        slug: 'hce-hub',
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
      expect.objectContaining({
        where: { id: { in: ['p1'] } },
        select: expect.objectContaining({ slug: true }),
      })
    );
    expect(cards[0]).toMatchObject({
      slug: 'hce-hub',
      memberCount: 2,
      featureCount: 5,
      lead: { name: 'Ada' },
    });
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
        slug: null,
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
    expect(cards[0].slug).toBeNull(); // unauthored slug — card links fall back to id
    expect(userFindMany).not.toHaveBeenCalled();
  });
});

describe('getProjectForUser', () => {
  it('returns the enriched view for a member (members + counts + null-user render)', async () => {
    getAccessible.mockResolvedValue({
      id: 'p1',
      slug: 'hce-hub',
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
    expect(view).toMatchObject({
      slug: 'hce-hub',
      featureCount: 3,
      taskCount: 7,
      memberCount: 2,
    });
    expect(view.lead?.name).toBe('Ada');
    expect(view.members.find((m) => m.userId === 'erased')?.user).toBeNull();
    expect(view.activeBugs).toEqual([]); // default mock: no open bugs → empty strip
  });

  it('maps open bug tasks into the active-bugs strip with an origin breadcrumb (§22-02 t2)', async () => {
    getAccessible.mockResolvedValue({
      id: 'p1',
      slug: 'hce-hub',
      name: 'Hub',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: [],
      leadUserId: null,
      createdAt: new Date(),
    });
    memberFindMany.mockResolvedValue([]);
    featureCount.mockResolvedValue(2);
    taskCount.mockResolvedValue(9);
    userFindMany.mockResolvedValue([]);
    taskFindMany.mockResolvedValue([
      {
        id: 'bug-1',
        number: 42,
        title: 'Log decisions render raw',
        feature: { slug: 'f-journal', title: 'Journal', phase: { name: 'Foundations' } },
      },
      {
        id: 'bug-2',
        number: null,
        title: 'Logout missing in nav',
        feature: { slug: null, title: 'Platform', phase: null }, // unfiled feature → no phase
      },
    ]);

    const view = await getProjectForUser('u1', 'p1');

    // Query scoped to open bugs in this project only.
    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feature: { projectId: 'p1' }, kind: 'bug', status: { not: 'merged' } },
      })
    );
    expect(view.activeBugs).toEqual([
      {
        taskId: 'bug-1',
        taskNumber: 42,
        title: 'Log decisions render raw',
        feature: { slug: 'f-journal', title: 'Journal' },
        phaseName: 'Foundations',
      },
      {
        taskId: 'bug-2',
        taskNumber: null,
        title: 'Logout missing in nav',
        feature: { slug: null, title: 'Platform' },
        phaseName: null,
      },
    ]);
  });

  it('renders a null lead (erased) without a lead lookup id', async () => {
    getAccessible.mockResolvedValue({
      id: 'p1',
      slug: null,
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
    expect(view.slug).toBeNull(); // unauthored slug — view falls back to id for links
    expect(userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['m1'] } } })
    );
  });

  it('propagates the funnel NotFoundError for a non-member / unknown id (→ 404, never 403)', async () => {
    getAccessible.mockRejectedValue(new NotFoundError('Project p9 not found'));
    await expect(getProjectForUser('u1', 'p9')).rejects.toBeInstanceOf(NotFoundError);
    expect(memberFindMany).not.toHaveBeenCalled();
  });

  it('resolves a slug ref and keys sub-queries off the canonical id, not the raw ref', async () => {
    getAccessible.mockResolvedValue({
      id: 'cuid-p1',
      slug: 'hce-hub',
      name: 'Hub',
      hostPlatform: 'sunrise',
      status: 'active',
      repoUrls: [],
      leadUserId: null,
      createdAt: new Date(),
    });
    memberFindMany.mockResolvedValue([]);
    featureCount.mockResolvedValue(0);
    taskCount.mockResolvedValue(0);
    userFindMany.mockResolvedValue([]);

    const view = await getProjectForUser('u1', 'hce-hub');

    expect(getAccessible).toHaveBeenCalledWith('u1', 'hce-hub');
    expect(view.id).toBe('cuid-p1');
    expect(view.slug).toBe('hce-hub');
    expect(memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'cuid-p1' } })
    );
    expect(featureCount).toHaveBeenCalledWith({ where: { projectId: 'cuid-p1' } });
    expect(taskCount).toHaveBeenCalledWith({ where: { feature: { projectId: 'cuid-p1' } } });
  });
});
