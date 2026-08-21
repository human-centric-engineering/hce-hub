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
import type { ProjectPlan } from '@/lib/projects/plan';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    feature: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    phase: { findMany: vi.fn() },
  },
}));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { getProjectPlan } = await import('@/lib/projects/plan');

const getAccessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const featureFindMany = prisma.feature.findMany as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;
const phaseFindMany = prisma.phase.findMany as ReturnType<typeof vi.fn>;

// The plan-ordered flat feature list (bands are a partition of it) — most
// assertions below predate phase grouping and read the flat list.
const flat = (plan: ProjectPlan) => plan.phases.flatMap((b) => b.features);

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
  phaseId: null,
  dependencies: [],
  indicativeTasks: [],
  tasks: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getAccessible.mockResolvedValue({ id: 'p1', slug: 'hce-hub' });
  userFindMany.mockResolvedValue([]);
  phaseFindMany.mockResolvedValue([]); // default: no phases → a single residual band
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
    expect(flat(plan)[0].tasks[0].status).toBe('blocked');
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
    expect(flat(plan)[0].tasks[0].status).toBe('claimed');
    expect(flat(plan)[0].tasks[0].claimer).toBeNull();
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
    expect(flat(plan)[0].owner).toBeNull();
    expect(flat(plan)[0].tasks[0].claimer).toBeNull();
  });

  it('enriches an owner that exists', async () => {
    featureFindMany.mockResolvedValue([row({ ownerUserId: 'u1' })]);
    userFindMany.mockResolvedValue([{ id: 'u1', name: 'Ada', email: 'a@x.io', image: null }]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(flat(plan)[0].owner).toEqual({ id: 'u1', name: 'Ada', email: 'a@x.io', image: null });
  });

  it('shows the ASSIGNEE on an open task, the DOER on a merged one (holder, §22 t2)', async () => {
    featureFindMany.mockResolvedValue([
      row({
        tasks: [
          {
            id: 'open',
            title: 'open, assigned to Ada but started by Bo',
            status: 'active',
            prUrl: null,
            claimedByUserId: 'bo', // someone else is actively working it
            assigneeUserId: 'ada', // ...but it's Ada's to own
            dependencies: [],
          },
          {
            id: 'done',
            title: 'merged — credit the doer',
            status: 'merged',
            prUrl: null,
            claimedByUserId: 'bo', // Bo did it
            assigneeUserId: 'ada', // even though later assigned to Ada
            dependencies: [],
          },
        ],
      }),
    ]);
    userFindMany.mockResolvedValue([
      { id: 'ada', name: 'Ada', email: 'a@x.io', image: null },
      { id: 'bo', name: 'Bo', email: 'b@x.io', image: null },
    ]);
    const tasks = flat(await getProjectPlan('u1', 'p1'))[0].tasks;
    expect(tasks[0].claimer?.name).toBe('Ada'); // open → assignee
    expect(tasks[1].claimer?.name).toBe('Bo'); // merged → doer
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
    const b = flat(plan).find((f) => f.id === 'b')!;
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
    const b = flat(plan).find((f) => f.id === 'b')!;
    expect(b.slug).toBe('f-shell');
    expect(b.tasks[0].number).toBe(7);
    expect(b.dependsOn).toEqual([{ id: 'a', slug: 'f-access', title: 'Foundation' }]);
  });

  it('drops a dependency edge pointing outside the loaded feature set (no crash)', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'b', title: 'Built on it', dependencies: [{ dependsOnFeatureId: 'gone' }] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(flat(plan)[0].dependsOn).toEqual([]);
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
    expect(flat(plan)[0].progress).toEqual({
      merged: 1,
      total: 3,
      live: 1,
      blocked: 0,
      openBugs: 0,
      openSinceShip: 0,
      unstartedSinceShip: 0,
    });
  });

  it('excludes a bug task from completion and reports it as an open bug (§22-02)', async () => {
    // A shipped feature: its two feature-work tasks are merged (reads 2/2), plus
    // one open bug that must NOT drag it to 2/3 — it surfaces as openBugs.
    featureFindMany.mockResolvedValue([
      row({
        status: 'shipped',
        tasks: [
          {
            id: 'w1',
            title: 'built',
            status: 'merged',
            kind: 'feature_work',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
          {
            id: 'w2',
            title: 'built',
            status: 'merged',
            kind: 'feature_work',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
          {
            id: 'bug1',
            title: 'a defect',
            status: 'active',
            kind: 'bug',
            prUrl: null,
            claimedByUserId: null,
            dependencies: [],
          },
        ],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(flat(plan)[0].progress).toEqual({
      merged: 2,
      total: 2, // NOT 3 — the bug is off the completion axis
      live: 0, // the worked bug is not "live" feature-work
      blocked: 0,
      openBugs: 1,
      openSinceShip: 0,
      unstartedSinceShip: 0,
    });
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
    expect(flat(plan)[0].planningStage).toBe('indicative');
    // Passed through in the query's `order` sort (the mock returns them as given).
    expect(flat(plan)[0].indicativeTasks).toEqual([
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
    expect(flat(plan)[0].tasks[1].status).toBe('blocked');
    expect(flat(plan)[0].progress).toEqual({
      merged: 0,
      total: 2,
      live: 1,
      blocked: 1,
      openBugs: 0,
      openSinceShip: 0,
      unstartedSinceShip: 0,
    });
  });

  it('returns features in planOrder (shipped before planning)', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'plan', status: 'planning' }),
      row({ id: 'ship', status: 'shipped' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(flat(plan).map((f) => f.id)).toEqual(['ship', 'plan']);
  });
});

describe('getProjectPlan — project slug (f-selfhost-cutover §19)', () => {
  it("carries the accessed project's slug for feature-page links", async () => {
    getAccessible.mockResolvedValue({ id: 'p1', slug: 'hce-hub' });
    featureFindMany.mockResolvedValue([]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.projectSlug).toBe('hce-hub');
  });

  it('returns a null projectSlug when the project has none (link falls back to projectId)', async () => {
    getAccessible.mockResolvedValue({ id: 'p1', slug: null });
    featureFindMany.mockResolvedValue([]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.projectSlug).toBeNull();
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
    const b = flat(plan).find((f) => f.id === 'b')!;
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
    const b = flat(plan).find((f) => f.id === 'b')!;
    expect(b.status).toBe('blocked');
    expect(b.waitingOn).toEqual([{ slug: 'f-a', title: 'Foundation' }]);
  });

  it('keeps an in_flight (claimed) feature in_flight when its deps are all shipped', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'a', title: 'Dep', status: 'shipped' }),
      row({
        id: 'b',
        title: 'Claimed feature',
        status: 'in_flight',
        dependencies: [{ dependsOnFeatureId: 'a' }],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    const b = flat(plan).find((f) => f.id === 'b')!;
    expect(b.status).toBe('in_flight');
    expect(b.waitingOn).toEqual([]);
  });

  it('blocks a CLAIMED (in_flight) feature with an unshipped dep — the t-39 overlay', async () => {
    // A part-built feature can become blocked mid-flight (owner 2026-08-03).
    featureFindMany.mockResolvedValue([
      row({ id: 'a', slug: 'f-dep', title: 'Dep', status: 'in_flight' }), // unshipped
      row({
        id: 'b',
        title: 'Claimed feature',
        status: 'in_flight',
        dependencies: [{ dependsOnFeatureId: 'a' }],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    const b = flat(plan).find((f) => f.id === 'b')!;
    expect(b.status).toBe('blocked');
    expect(b.waitingOn).toEqual([{ slug: 'f-dep', title: 'Dep' }]);
  });

  it("passes a shipped feature's status through unchanged", async () => {
    featureFindMany.mockResolvedValue([row({ id: 'a', status: 'shipped' })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(flat(plan)[0].status).toBe('shipped');
  });

  it('never surfaces the raw stored "planning" status on the payload', async () => {
    featureFindMany.mockResolvedValue([row({ id: 'a', status: 'planning' })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(flat(plan).map((f) => f.status)).not.toContain('planning');
  });

  it('carries the stable feature number', async () => {
    featureFindMany.mockResolvedValue([row({ id: 'a', number: 7 })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(flat(plan)[0].number).toBe(7);
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
    expect(flat(plan)[0].id).toBe('c');
  });
});

describe('getProjectPlan — phase grouping (f-phases §22 t2)', () => {
  const phase = (over: Record<string, unknown> = {}) => ({
    id: 'ph1',
    name: 'Phase',
    status: 'upcoming',
    ordinal: 0,
    ...over,
  });

  it('with no phases, returns a single residual band = the flat plan list', async () => {
    featureFindMany.mockResolvedValue([
      row({ id: 'a', status: 'shipped' }),
      row({ id: 'b', status: 'planning' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.phases).toHaveLength(1);
    expect(plan.phases[0].id).toBeNull();
    // planOrder still applies inside the residual band: shipped before planning.
    expect(plan.phases[0].features.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('orders bands in true ordinal order (parked included), residual last', async () => {
    phaseFindMany.mockResolvedValue([
      phase({ id: 'p-active', name: 'Active', status: 'active', ordinal: 0 }),
      phase({ id: 'p-parked', name: 'Ideas', status: 'parked', ordinal: 1 }),
      phase({ id: 'p-up', name: 'Next', status: 'upcoming', ordinal: 2 }),
    ]);
    featureFindMany.mockResolvedValue([
      row({ id: 'inActive', status: 'in_flight', phaseId: 'p-active' }),
      row({ id: 'unfiled', status: 'planning', phaseId: null }),
      row({ id: 'inParked', status: 'planning', phaseId: 'p-parked' }),
      row({ id: 'inUp', status: 'planning', phaseId: 'p-up' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    // A parked phase (ordinal 1) is NOT sunk to the bottom — it sits between the
    // active (0) and upcoming (2) phases, mirroring the manage dialog; residual last.
    expect(plan.phases.map((b) => b.id)).toEqual(['p-active', 'p-parked', 'p-up', null]);
    expect(plan.phases.find((b) => b.id === 'p-active')!.features.map((f) => f.id)).toEqual([
      'inActive',
    ]);
    expect(plan.phases.find((b) => b.id === null)!.features.map((f) => f.id)).toEqual(['unfiled']);
    expect(plan.phases.find((b) => b.id === 'p-parked')!.features.map((f) => f.id)).toEqual([
      'inParked',
    ]);
  });

  it('keeps an empty real phase (roadmap skeleton) but drops an empty residual', async () => {
    phaseFindMany.mockResolvedValue([
      phase({ id: 'ph1', ordinal: 0 }),
      phase({ id: 'ph2', ordinal: 1 }),
    ]);
    // Every feature is filed → no residual band; ph2 stays though it's empty.
    featureFindMany.mockResolvedValue([row({ id: 'a', phaseId: 'ph1' })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.phases.map((b) => b.id)).toEqual(['ph1', 'ph2']);
    expect(plan.phases.find((b) => b.id === 'ph2')!.features).toEqual([]);
  });

  it('routes a feature whose phaseId is not in the project to the residual band', async () => {
    phaseFindMany.mockResolvedValue([phase({ id: 'ph1', ordinal: 0 })]);
    featureFindMany.mockResolvedValue([row({ id: 'a', phaseId: 'ghost-phase' })]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.phases.find((b) => b.id === null)!.features.map((f) => f.id)).toEqual(['a']);
  });

  it('preserves planOrder within a single band', async () => {
    phaseFindMany.mockResolvedValue([phase({ id: 'ph1', ordinal: 0 })]);
    featureFindMany.mockResolvedValue([
      row({ id: 'plan', status: 'planning', phaseId: 'ph1' }),
      row({ id: 'ship', status: 'shipped', phaseId: 'ph1' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.phases[0].features.map((f) => f.id)).toEqual(['ship', 'plan']);
  });
});

/**
 * §32 t-95. `Task.phaseId` — "the phase that chose to do this work" — shipped in
 * t-80 with the model, the migration and the MCP verbs, and **no read surface**.
 * A task committed to a phase other than its feature's now renders inline in that
 * band, while staying put in its origin feature's own table.
 */
describe('getProjectPlan — tasks borrowed into a phase band (§32 t-95)', () => {
  const phase = (over: Record<string, unknown> = {}) => ({
    id: 'ph1',
    name: 'Phase',
    status: 'upcoming',
    ordinal: 0,
    description: null,
    ...over,
  });
  const task = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    number: 93,
    title: 'A borrowed task',
    status: 'claimed',
    kind: 'enhancement',
    createdAt: new Date('2026-08-09T00:00:00Z'),
    phaseId: null,
    prUrl: null,
    claimedByUserId: null,
    assigneeUserId: null,
    dependencies: [],
    ...over,
  });
  /** Two phases: work lives in `old`, and `now` borrows it. */
  const twoPhases = () =>
    phaseFindMany.mockResolvedValue([
      phase({ id: 'old', name: 'Foundations', status: 'complete', ordinal: 0 }),
      phase({ id: 'now', name: 'Project flow', status: 'active', ordinal: 1 }),
    ]);
  const bandRows = (plan: Awaited<ReturnType<typeof getProjectPlan>>, id: string) =>
    plan.phases.find((b) => b.id === id)!.rows;

  it('renders a committed task in the BORROWING band, not only its own', async () => {
    // The live shape: t-93 sits on a shipped feature in a completed phase, and is
    // committed to the active one. Before this it appeared only under the old band.
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: 'now' })] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');

    const borrowed = bandRows(plan, 'now').filter((r) => r.kind === 'task');
    expect(borrowed).toHaveLength(1);
    expect(borrowed[0].kind === 'task' && borrowed[0].task.number).toBe(93);
    // …and the origin band still holds its feature, unchanged.
    expect(bandRows(plan, 'old').map((r) => r.kind)).toEqual(['feature']);
  });

  it('leaves the task in its origin feature’s table too — it renders at BOTH ends', async () => {
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: 'now' })] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');

    const feature = plan.phases.find((b) => b.id === 'old')!.features[0];
    expect(feature.tasks.map((t) => t.id)).toEqual(['t1']); // still in place
    expect(feature.tasks[0].committedPhaseName).toBe('Project flow'); // and says where it went
  });

  it('carries the origin breadcrumb — feature ref + the phase it came from', async () => {
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({
        id: 'origin',
        slug: 'f-status-model',
        title: 'Readiness-derived status',
        status: 'shipped',
        phaseId: 'old',
        tasks: [task({ phaseId: 'now' })],
      }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');

    const row0 = bandRows(plan, 'now')[0];
    expect(row0.kind).toBe('task');
    if (row0.kind !== 'task') throw new Error('unreachable');
    expect(row0.task.feature).toEqual({
      id: 'origin',
      slug: 'f-status-model',
      title: 'Readiness-derived status',
    });
    expect(row0.task.originPhaseName).toBe('Foundations');
  });

  it('does NOT borrow a task committed to its own feature’s phase — that is just inheritance', async () => {
    twoPhases();
    featureFindMany.mockResolvedValue([
      // phaseId equal to the feature's: the commitment agrees, nothing to show twice.
      row({ id: 'origin', status: 'shipped', phaseId: 'now', tasks: [task({ phaseId: 'now' })] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(bandRows(plan, 'now').filter((r) => r.kind === 'task')).toEqual([]);
    expect(
      plan.phases.find((b) => b.id === 'now')!.features[0].tasks[0].committedPhaseName
    ).toBeNull();
  });

  it('does NOT borrow an uncommitted task (phaseId null = inherit, today’s behaviour)', async () => {
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: null })] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(bandRows(plan, 'now')).toEqual([]);
    expect(bandRows(plan, 'old').every((r) => r.kind === 'feature')).toBe(true);
  });

  /**
   * The load-bearing ordering requirement (owner): a borrowed task can be the thing
   * BLOCKING a feature new to the phase, so parking borrowed rows at the end would
   * sort it below the very feature it blocks. Placement must not encode "borrowed".
   */
  it('places a borrowed task INLINE by readiness, never in a trailing sub-band', async () => {
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: 'now' })] }),
      // A blocked feature in the borrowing band — it must sort BELOW the ready
      // borrowed task, which is exactly what a trailing sub-band would invert.
      row({ id: 'blockedHere', status: 'blocked', phaseId: 'now' }),
      row({ id: 'shippedHere', status: 'shipped', phaseId: 'now' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');

    const kinds = bandRows(plan, 'now').map((r) =>
      r.kind === 'task' ? `task:${r.task.id}` : `feature:${r.feature.id}`
    );
    // shipped(0) → the claimed borrowed task(2) → blocked(3). Not last.
    expect(kinds).toEqual(['feature:shippedHere', 'task:t1', 'feature:blockedHere']);
  });

  it('places a borrowed task before a feature of EQUAL readiness — a tie is the blocking case', async () => {
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: 'now' })] }),
      row({ id: 'planningHere', status: 'planning', phaseId: 'now' }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(bandRows(plan, 'now')[0].kind).toBe('task');
  });

  it('keeps `features` free of borrowed tasks — a borrow is not membership', async () => {
    // The band's feature count, the plan summary and the auto-expand pick all read
    // `features`; a borrowed task must not inflate any of them.
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: 'now' })] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.phases.find((b) => b.id === 'now')!.features).toEqual([]);
    expect(bandRows(plan, 'now')).toHaveLength(1); // …but it still renders
  });

  it('rows and features cannot drift — every feature appears exactly once in rows', async () => {
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: 'now' })] }),
      row({ id: 'a', status: 'planning', phaseId: 'now' }),
      row({ id: 'b', status: 'in_flight', phaseId: 'now' }),
      row({ id: 'unfiled', status: 'planning', phaseId: null }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    for (const band of plan.phases) {
      const inRows = band.rows.flatMap((r) => (r.kind === 'feature' ? [r.feature.id] : []));
      expect(inRows).toEqual(band.features.map((f) => f.id));
    }
  });

  it('ignores a commitment to a phase that no longer exists — the row is never lost', async () => {
    // Mirrors the existing feature-level rule: a dangling phaseId degrades, it
    // never drops the task from its own feature's table.
    twoPhases();
    featureFindMany.mockResolvedValue([
      row({ id: 'origin', status: 'shipped', phaseId: 'old', tasks: [task({ phaseId: 'ghost' })] }),
    ]);
    const plan = await getProjectPlan('u1', 'p1');
    expect(plan.phases.every((b) => b.rows.every((r) => r.kind === 'feature'))).toBe(true);
    expect(plan.phases.find((b) => b.id === 'old')!.features[0].tasks).toHaveLength(1);
  });
});
