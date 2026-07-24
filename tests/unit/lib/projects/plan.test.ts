/**
 * Unit: `getProjectPlan` — the Plan view feature-tree read (f-plan-view t-1).
 *
 * Load-bearing assertions:
 *   - membership is the funnel's — `getAccessibleProject` deny (NotFoundError)
 *     propagates → 404-not-403 at the boundary;
 *   - task status is the shared `computeEffectiveStatus` (f-status-model §20: a
 *     dep-blocked `claimed` task is `blocked`; the claimant no longer gates it);
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
  planningStage: 'indicative',
  helpWanted: false,
  ownerUserId: null,
  dependencies: [],
  indicativeTasks: [],
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
  it('returns a dep-blocked claimed task as blocked', async () => {
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 't1',
            title: 'Blocked task',
            status: 'claimed',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [{ dependsOn: { status: 'claimed' } }], // dep not merged
          },
        ],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].tasks[0].status).toBe('blocked');
  });

  it('reports a claimed task as claimed regardless of its claimant (f-status-model §20 — the claimant no longer gates readiness)', async () => {
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 't1',
            title: 'Erased claimant',
            status: 'claimed',
            prUrl: null,
            claimedByUserId: null, // erased claimant — never dereferenced
            dependencies: [],
          },
        ],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].tasks[0].status).toBe('claimed');
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
            status: 'claimed',
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
            status: 'active',
            prUrl: null,
            claimedByUserId: 'u1',
            dependencies: [],
          },
          {
            id: 't3',
            title: 'ready but not started',
            status: 'claimed',
            prUrl: null,
            claimedByUserId: 'u1',
            dependencies: [],
          },
        ],
      }),
    ]);
    userFindMany.mockResolvedValue([{ id: 'u1', name: 'Ada', email: 'a@x.io', image: null }]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].progress).toEqual({ merged: 1, total: 3, live: 1, blocked: 0 });
  });

  it('carries planningStage + the ordered indicative sketch (§18)', async () => {
    featureFindMany.mockResolvedValue([
      row({
        planningStage: 'indicative',
        indicativeTasks: [
          { id: 'i2', order: 1, text: 'second' },
          { id: 'i1', order: 0, text: 'first' },
        ],
      }),
    ]);
    userFindMany.mockResolvedValue([]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].planningStage).toBe('indicative');
    // Passed through in the query's `order` sort (the mock returns them as given).
    expect(plan.features[0].indicativeTasks).toEqual([
      { id: 'i2', order: 1, text: 'second' },
      { id: 'i1', order: 0, text: 'first' },
    ]);
  });

  it('counts a dep-blocked task as blocked, not live (§09 carry — matches its row)', async () => {
    // A `claimed` task whose dependency is unmerged is effectively `blocked`;
    // it must NOT inflate `live` (which counts effective `active`), so the
    // feature summary agrees with the row.
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 't1',
            title: 'in progress',
            status: 'active',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
          {
            id: 't2',
            title: 'blocked',
            status: 'claimed',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [{ dependsOn: { status: 'claimed' } }], // dep not merged
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

describe('getProjectPlan — readiness-derived feature status (f-status-model §20 t-37)', () => {
  it('derives "available" for a not-started feature whose dependencies are all shipped', async () => {
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
    expect(b.status).toBe('available');
    expect(b.waitingOn).toEqual([]);
  });

  it('derives "blocked" naming the unshipped dependency the feature is waiting on', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'a', slug: 'f-a', title: 'Foundation', status: 'in_flight' }),
      row({
        id: 'b',
        title: 'Built on it',
        status: 'planning',
        dependencies: [{ dependsOnFeatureId: 'a' }],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    const b = plan.features.find((f) => f.id === 'b')!;
    expect(b.status).toBe('blocked');
    expect(b.waitingOn).toEqual([{ slug: 'f-a', title: 'Foundation' }]);
  });

  it("passes an in_flight (claimed) feature's status through unchanged, ignoring its deps", async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'a', title: 'Dep', status: 'planning' }), // still un-started, would block
      row({
        id: 'b',
        title: 'Claimed feature',
        status: 'in_flight',
        dependencies: [{ dependsOnFeatureId: 'a' }],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    const b = plan.features.find((f) => f.id === 'b')!;
    expect(b.status).toBe('in_flight');
    expect(b.waitingOn).toEqual([]);
  });

  it("passes a shipped feature's status through unchanged", async () => {
    featureFindMany.mockResolvedValue([row({ id: 'a', status: 'shipped' })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].status).toBe('shipped');
  });

  it('never surfaces the raw stored "planning" status on the payload', async () => {
    featureFindMany.mockResolvedValue([row({ id: 'a', status: 'planning' })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features.map((f) => f.status)).not.toContain('planning');
  });

  it('carries the stable feature number', async () => {
    featureFindMany.mockResolvedValue([row({ id: 'a', number: 7 })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.features[0].number).toBe(7);
  });

  it('still orders by the STORED status, not the derived one (planOrder unaffected)', async () => {
    // 'b' is stored `planning` but DERIVES to `blocked` (its dep is un-started);
    // ordering must still band on the raw stored value the query returned.
    featureFindMany.mockResolvedValue([
      row({ id: 'a', status: 'planning' }),
      row({
        id: 'b',
        status: 'planning',
        dependencies: [{ dependsOnFeatureId: 'a' }],
      }),
      row({ id: 'c', status: 'shipped' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    // Shipped bands first regardless of any feature's derived status.
    expect(plan.features[0].id).toBe('c');
  });
});
