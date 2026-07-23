/**
 * Unit: `getProjectBoard` — the Board routing read (f-board-view t-1).
 *
 * Load-bearing assertions:
 *   - membership is the funnel's — `getAccessibleProject` deny → 404-not-403;
 *   - routing: the held-by claimer's lane (else the feature owner); effective
 *     status drives the column — a deps-blocked `claimed` task folds into the
 *     Claimed column (f-status-model §20: three columns, claimed/active/merged);
 *   - carried f-data-model t-3: an orphaned / non-member-owned task → Unassigned;
 *   - soft collision: overlapping open claims flag both tasks (`filesOverlap`).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    projectMember: { findMany: vi.fn() },
    feature: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    taskClaim: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { getProjectBoard } = await import('@/lib/projects/board');

const getAccessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const memberFindMany = prisma.projectMember.findMany as ReturnType<typeof vi.fn>;
const featureFindMany = prisma.feature.findMany as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const claimFindMany = prisma.taskClaim.findMany as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

const task = (o: Record<string, unknown> & { deps?: string[] }) => ({
  id: o.id,
  number: o.number ?? null,
  title: o.title ?? o.id,
  featureId: o.featureId,
  status: o.status ?? 'claimed',
  prUrl: o.prUrl ?? null,
  claimedByUserId: o.claimedByUserId ?? null,
  dependencies: (o.deps ?? []).map((s: string) => ({ dependsOn: { status: s } })),
});
const feature = (id: string, ownerUserId: string | null = null, slug: string | null = null) => ({
  id,
  slug,
  title: id,
  ownerUserId,
});
const member = (userId: string, role = 'member') => ({ userId, role });
const userRow = (id: string) => ({ id, name: id.toUpperCase(), email: `${id}@x.io`, image: null });

interface Setup {
  members?: { userId: string; role: string }[];
  features?: { id: string; title: string; ownerUserId: string | null }[];
  tasks?: unknown[];
  claims?: unknown[];
  users?: { id: string }[];
}
function setup(s: Setup) {
  getAccessible.mockResolvedValue({ id: 'p1' });
  memberFindMany.mockResolvedValue(s.members ?? []);
  featureFindMany.mockResolvedValue(s.features ?? []);
  taskFindMany.mockResolvedValue(s.tasks ?? []);
  claimFindMany.mockResolvedValue(s.claims ?? []);
  userFindMany.mockResolvedValue(s.users ?? []);
}
const laneOf = <T extends { key: string }>(board: { lanes: T[] }, key: string): T | undefined =>
  board.lanes.find((l) => l.key === key);

beforeEach(() => vi.clearAllMocks());

describe('getProjectBoard — membership funnel', () => {
  it('propagates NotFoundError (→ 404, never 403) and reads nothing', async () => {
    getAccessible.mockRejectedValue(new NotFoundError('nope'));
    await expect(getProjectBoard('u1', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(memberFindMany).not.toHaveBeenCalled();
  });
});

describe('getProjectBoard — lane + column routing', () => {
  it('routes an actively-worked task to the claimer lane, Active column', async () => {
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'active', claimedByUserId: 'u2' })],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const u2 = laneOf(board, 'u2')!;
    expect(u2.tasks).toHaveLength(1);
    expect(u2.tasks[0]).toMatchObject({ id: 't1', column: 'active' });
    expect(laneOf(board, 'u1')!.tasks).toHaveLength(0);
  });

  it('routes a ready (unclaimed by anyone in particular) claimed task to the owner lane, Claimed column', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed' })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'u1')!.tasks[0]).toMatchObject({ id: 't1', column: 'claimed' });
  });

  it('routes a merged task to the CLAIMER lane (credit the doer), not the owner', async () => {
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1')], // owned by u1
      tasks: [task({ id: 't1', featureId: 'f1', status: 'merged', claimedByUserId: 'u2' })],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'u2')!.tasks[0]).toMatchObject({ id: 't1', column: 'merged' });
    expect(laneOf(board, 'u1')!.tasks).toHaveLength(0);
  });

  it('folds a deps-blocked claimed task into the Claimed column, with the blocked treatment (owner lane)', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed', deps: ['claimed'] })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'u1')!.tasks[0]).toMatchObject({
      id: 't1',
      column: 'claimed',
      status: 'blocked',
    });
  });
});

describe('getProjectBoard — carried f-data-model findings', () => {
  it('t-2: a null-claimant claimed task → owner lane, Claimed column (not a phantom lane)', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: null })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'u1')!.tasks[0]).toMatchObject({
      id: 't1',
      column: 'claimed',
      status: 'claimed',
    });
    expect(laneOf(board, 'unassigned')).toBeUndefined();
  });

  it('t-3: an orphaned task (null owner, no claimer) → the Unassigned lane, no crash', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', null)],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed' })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const un = laneOf(board, 'unassigned')!;
    expect(un.member).toBeNull();
    expect(un.tasks[0]).toMatchObject({ id: 't1' });
  });

  it('t-3: a task owned by a non-member → the Unassigned lane', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'ghost')], // ghost is not a member
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed' })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'unassigned')!.tasks).toHaveLength(1);
    expect(laneOf(board, 'u1')!.tasks).toHaveLength(0);
  });

  it('omits the Unassigned lane when nothing is orphaned', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed' })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'unassigned')).toBeUndefined();
  });
});

describe('getProjectBoard — soft collision', () => {
  it('flags both tasks when two open claims have overlapping file scope', async () => {
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: 'u1' }),
        task({ id: 't2', featureId: 'f1', status: 'claimed', claimedByUserId: 'u2' }),
      ],
      claims: [
        { userId: 'u1', task: { id: 't1', title: 'T1', filesScope: ['src/a'] } },
        { userId: 'u2', task: { id: 't2', title: 'T2', filesScope: ['src/a/b'] } },
      ],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const t1 = laneOf(board, 'u1')!.tasks.find((t) => t.id === 't1')!;
    const t2 = laneOf(board, 'u2')!.tasks.find((t) => t.id === 't2')!;
    expect(t1.collision).not.toBeNull();
    expect(t2.collision).not.toBeNull();
    expect(t1.collision!.note).toContain('T2');
  });

  it('flags nothing when file scopes do not overlap', async () => {
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: 'u1' }),
        task({ id: 't2', featureId: 'f1', status: 'claimed', claimedByUserId: 'u2' }),
      ],
      claims: [
        { userId: 'u1', task: { id: 't1', title: 'T1', filesScope: ['src/a'] } },
        { userId: 'u2', task: { id: 't2', title: 'T2', filesScope: ['src/z'] } },
      ],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'u1')!.tasks[0].collision).toBeNull();
  });
});

describe('getProjectBoard — presentation', () => {
  it('marks the caller’s own claim as isMine and resolves the claimer', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: 'u1' })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const card = laneOf(board, 'u1')!.tasks[0];
    expect(card.isMine).toBe(true);
    expect(card.claimer).toMatchObject({ id: 'u1' });
  });

  it('threads the feature slug + task number onto cards and lane chips (f-refs)', async () => {
    setup({
      members: [member('u1', 'lead')],
      features: [feature('f1', 'u1', 'f-mcp')], // slug f-mcp
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed', number: 9 })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const lane = laneOf(board, 'u1')!;
    expect(lane.tasks[0]).toMatchObject({ number: 9, featureSlug: 'f-mcp' });
    expect(lane.ownedFeatures[0]).toMatchObject({ id: 'f1', slug: 'f-mcp' });
  });

  it('sorts member lanes by task count (most active first)', async () => {
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1'), feature('f2', 'u2')],
      tasks: [
        task({ id: 'a', featureId: 'f2', status: 'claimed' }),
        task({ id: 'b', featureId: 'f1', status: 'claimed' }),
        task({ id: 'c', featureId: 'f1', status: 'claimed' }),
      ],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    // u1 owns 2 tasks, u2 owns 1 → u1 first.
    expect(board.lanes.map((l) => l.key)).toEqual(['u1', 'u2']);
  });

  it('computes column totals from effective status (blocked folds into claimed)', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({ id: 't1', featureId: 'f1', status: 'merged' }),
        task({ id: 't2', featureId: 'f1', status: 'claimed', deps: ['claimed'] }), // → blocked, folds into claimed
        task({ id: 't3', featureId: 'f1', status: 'claimed' }),
      ],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(board.columnTotals).toMatchObject({
      merged: 1,
      claimed: 2,
      active: 0,
    });
  });

  it('renders an erased member/claimer as null, never dereferencing (carried null-render)', async () => {
    setup({
      members: [member('gone')], // member row exists, user row does not
      features: [feature('f1', 'gone')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: 'gone' })],
      users: [], // fetchUsers finds nobody
    });
    const board = await getProjectBoard('u1', 'p1');
    const lane = laneOf(board, 'gone')!;
    expect(lane.member).toBeNull();
    expect(lane.tasks[0].claimer).toBeNull();
  });

  it('lists a member’s owned features on their lane', async () => {
    setup({
      members: [member('u1', 'lead')],
      features: [feature('f1', 'u1'), feature('f2', 'u1')],
      tasks: [],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const u1 = laneOf(board, 'u1')!;
    expect(u1.role).toBe('lead');
    expect(u1.ownedFeatures.map((f) => f.id)).toEqual(['f1', 'f2']);
  });
});
