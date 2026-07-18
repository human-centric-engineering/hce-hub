/**
 * Unit: `getProjectPlan` — the Plan view feature-tree read (f-plan-view t-1).
 *
 * Load-bearing assertions:
 *   - membership is the funnel's — `getAccessibleProject` deny (NotFoundError)
 *     propagates → 404-not-403 at the boundary;
 *   - task status is the shared `computeEffectiveStatus` (a null-claimant
 *     `claimed` task returns to the pool; a dep-blocked `available` is `blocked`);
 *   - nullable owner/claimer refs resolve to `null`, never a throw;
 *   - dependency chips carry the depended-on feature's title.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { feature: { findMany: vi.fn() }, user: { findMany: vi.fn() } },
}));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { getProjectPlan } = await import('@/lib/projects/plan');

const getAccessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const featureFindMany = prisma.feature.findMany as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

// A feature row as the select would return it.
const row = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  slug: null,
  title: 'Feature one',
  description: null,
  status: 'planning',
  helpWanted: false,
  ownerUserId: null,
  dependencies: [],
  tasks: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getAccessible.mockResolvedValue({ id: 'p1' });
  userFindMany.mockResolvedValue([]);
});

describe('getProjectPlan — membership funnel', () => {
  it('propagates NotFoundError from getAccessibleProject (→ 404, never 403)', async () => {
    getAccessible.mockRejectedValue(new NotFoundError('Project p1 not found'));
    await expect(getProjectPlan('u1', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(featureFindMany).not.toHaveBeenCalled();
  });

  it('scopes the feature query to the accessed project', async () => {
    featureFindMany.mockResolvedValue([]);
    await getProjectPlan('u1', 'p1');
    expect(getAccessible).toHaveBeenCalledWith('u1', 'p1');
    expect(featureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' } })
    );
  });
});

describe('getProjectPlan — effective status (shared with the Board)', () => {
  it('returns a dep-blocked available task as blocked', async () => {
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 't1',
            title: 'Blocked task',
            status: 'available',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [{ dependsOn: { status: 'available' } }], // dep not merged
          },
        ],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].tasks[0].status).toBe('blocked');
  });

  it('returns a null-claimant claimed task to the pool (not "claimed")', async () => {
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 't1',
            title: 'Orphaned claim',
            status: 'claimed',
            prUrl: null,
            claimedByUserId: null, // erased claimant
            dependencies: [],
          },
        ],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].tasks[0].status).toBe('available');
    expect(plan.features[0].tasks[0].claimer).toBeNull();
  });
});

describe('getProjectPlan — nullable refs render gracefully', () => {
  it('resolves a missing owner/claimer to null, never throwing', async () => {
    featureFindMany.mockResolvedValue([
      row({
        ownerUserId: 'ghost', // user no longer exists
        tasks: [
          {
            id: 't1',
            title: 'Claimed by ghost',
            status: 'claimed',
            prUrl: null,
            claimedByUserId: 'ghost',
            dependencies: [],
          },
        ],
      }),
    ]);
    userFindMany.mockResolvedValue([]); // fetchUsers finds nobody
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].owner).toBeNull();
    expect(plan.features[0].tasks[0].claimer).toBeNull();
  });

  it('enriches an owner that exists', async () => {
    featureFindMany.mockResolvedValue([row({ ownerUserId: 'u1' })]);
    userFindMany.mockResolvedValue([{ id: 'u1', name: 'Ada', email: 'a@x.io', image: null }]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].owner).toEqual({ id: 'u1', name: 'Ada', email: 'a@x.io', image: null });
  });
});

describe('getProjectPlan — dependency chips + progress + ordering', () => {
  it('renders dependency chips with the depended-on feature title', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'a', title: 'Foundation', status: 'shipped' }),
      row({
        id: 'b',
        title: 'Built on it',
        status: 'planning',
        dependencies: [{ dependsOnFeatureId: 'a' }],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    const b = plan.features.find((f) => f.id === 'b')!;
    expect(b.dependsOn).toEqual([{ id: 'a', slug: null, title: 'Foundation' }]);
  });

  it('threads the feature slug, task number, and depended-on slug (f-refs)', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'a', slug: 'f-access', title: 'Foundation', status: 'shipped' }),
      row({
        id: 'b',
        slug: 'f-shell',
        title: 'Built on it',
        status: 'planning',
        dependencies: [{ dependsOnFeatureId: 'a' }],
        tasks: [
          {
            id: 't1',
            number: 7,
            title: 'a task',
            status: 'available',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
        ],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    const b = plan.features.find((f) => f.id === 'b')!;
    expect(b.slug).toBe('f-shell');
    expect(b.tasks[0].number).toBe(7);
    expect(b.dependsOn).toEqual([{ id: 'a', slug: 'f-access', title: 'Foundation' }]);
  });

  it('drops a dependency edge pointing outside the loaded feature set (no crash)', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'b', title: 'Built on it', dependencies: [{ dependsOnFeatureId: 'gone' }] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].dependsOn).toEqual([]);
  });

  it('computes progress off effective status (merged/total + live + blocked)', async () => {
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 't1',
            title: 'done',
            status: 'merged',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
          {
            id: 't2',
            title: 'wip',
            status: 'claimed',
            prUrl: null,
            claimedByUserId: 'u1',
            dependencies: [],
          },
          {
            id: 't3',
            title: 'idea',
            status: 'backlog',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
        ],
      }),
    ]);
    userFindMany.mockResolvedValue([{ id: 'u1', name: 'Ada', email: 'a@x.io', image: null }]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].progress).toEqual({ merged: 1, total: 3, live: 1, blocked: 0 });
  });

  it('counts a dep-blocked task as blocked, not live (§09 carry — matches its row)', async () => {
    // An `available` task whose dependency is unmerged is effectively `blocked`;
    // it must NOT inflate `live`, so the feature summary agrees with the row.
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 't1',
            title: 'ready',
            status: 'available',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
          {
            id: 't2',
            title: 'blocked',
            status: 'available',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [{ dependsOn: { status: 'available' } }], // dep not merged
          },
        ],
      }),
    ]);
    userFindMany.mockResolvedValue([]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].tasks[1].status).toBe('blocked');
    expect(plan.features[0].progress).toEqual({ merged: 0, total: 2, live: 1, blocked: 1 });
  });

  it('returns features in planOrder (shipped before planning)', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'plan', status: 'planning' }),
      row({ id: 'ship', status: 'shipped' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features.map((f) => f.id)).toEqual(['ship', 'plan']);
  });
});
