/**
 * Unit: `getProjectBoard` — the Board routing read (f-board-view t-1).
 *
 * Load-bearing assertions:
 *   - membership is the funnel's — `getAccessibleProject` deny → 404-not-403;
 *   - routing: the holder's lane — with **no feature-owner fallback** (§32 t-89),
 *     so unheld work reaches the Unassigned lane instead of its owner's; effective
 *     status drives the column — a deps-blocked `claimed` task folds into the
 *     Claimed column (f-status-model §20: three columns, claimed/active/merged);
 *   - carried f-data-model t-3: a task held by nobody, or by a non-member →
 *     Unassigned;
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
  kind: o.kind ?? 'feature_work',
  prUrl: o.prUrl ?? null,
  claimedByUserId: o.claimedByUserId ?? null,
  assigneeUserId: o.assigneeUserId ?? null,
  mergedAt: o.mergedAt ?? null,
  withdrawnAt: o.withdrawnAt ?? null,
  dependencies: (o.deps ?? []).map((s: string) => ({
    dependsOn: { status: s, withdrawnAt: null },
  })),
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

  it('routes a born-claimed task to its holder’s lane, Claimed column', async () => {
    // `create_task` cascades the feature owner onto both user fields, so a born
    // task arrives here already held — it is not routed by a fallback (§32 t-89).
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({
          id: 't1',
          featureId: 'f1',
          status: 'claimed',
          claimedByUserId: 'u1',
          assigneeUserId: 'u1',
        }),
      ],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'u1')!.tasks[0]).toMatchObject({ id: 't1', column: 'claimed' });
  });

  it('routes a task with NO holder to the Unassigned lane, not the feature owner’s (§32 t-89)', async () => {
    // A born `enhancement`: nobody has taken it, and the feature owner says nothing
    // about who should. Before t-89 the owner fallback swallowed this case, which
    // is why the Unassigned lane had been unreachable since §10.
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')], // owned — and deliberately not consulted
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed', kind: 'enhancement' })],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');

    expect(laneOf(board, 'unassigned')!.tasks[0]).toMatchObject({ id: 't1', column: 'claimed' });
    expect(laneOf(board, 'u1')!.tasks).toHaveLength(0);
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

  it('routes an OPEN task to the ASSIGNEE lane when someone else started it (holder = assignee, §22 t2)', async () => {
    // The someone-else-started edge: assigned to u1, but actively claimed by u2.
    // Open → the holder is the assignee (u1), so it sits in *whose work it is*.
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({
          id: 't1',
          featureId: 'f1',
          status: 'active',
          claimedByUserId: 'u2',
          assigneeUserId: 'u1',
        }),
      ],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u2', 'p1');
    // Routed to the assignee (u1) lane, showing the assignee — not the active claimer.
    const u1 = laneOf(board, 'u1')!;
    expect(u1.tasks[0]).toMatchObject({ id: 't1', column: 'active' });
    expect(u1.tasks[0].claimer).toMatchObject({ id: 'u1' });
    // `is-mine` follows the holder (u1), not the active claimer (u2, the caller) —
    // the card, its lane, and the highlight all agree on one person.
    expect(u1.tasks[0].isMine).toBe(false);
    expect(laneOf(board, 'u2')!.tasks).toHaveLength(0);
  });

  it('folds a deps-blocked claimed task into the Claimed column, with the blocked treatment (owner lane)', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({
          id: 't1',
          featureId: 'f1',
          status: 'claimed',
          claimedByUserId: 'u1',
          deps: ['claimed'],
        }),
      ],
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
  it('t-2: a null-claimant claimed task falls to its assignee’s lane (not a phantom lane)', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({
          id: 't1',
          featureId: 'f1',
          status: 'claimed',
          claimedByUserId: null,
          assigneeUserId: 'u1',
        }),
      ],
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

  it('carries a task kind onto the card so bugs can be marked (§22-02 t2)', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({ id: 'bug', featureId: 'f1', status: 'active', claimedByUserId: 'u1', kind: 'bug' }),
        task({ id: 'work', featureId: 'f1', status: 'active', claimedByUserId: 'u1' }),
      ],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const cards = laneOf(board, 'u1')!.tasks;
    expect(cards.find((c) => c.id === 'bug')?.kind).toBe('bug');
    expect(cards.find((c) => c.id === 'work')?.kind).toBe('feature_work');
  });

  it('t-3: a task HELD by a non-member → the Unassigned lane', async () => {
    // Someone left the project (or was erased) while holding work. It is nobody's
    // now — showing it as the feature owner's would misattribute it.
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: 'ghost' }), // not a member
      ],
      users: [userRow('u1')],
    });
    const board = await getProjectBoard('u1', 'p1');
    expect(laneOf(board, 'unassigned')!.tasks).toHaveLength(1);
    expect(laneOf(board, 'u1')!.tasks).toHaveLength(0);
  });

  it('omits the Unassigned lane when every task is held', async () => {
    setup({
      members: [member('u1')],
      features: [feature('f1', 'u1')],
      tasks: [task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: 'u1' })],
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

  it('never marks a BLOCKED card — such a task holds no open claim to collide with', async () => {
    // Not a suppression rule, an invariant (`/code-review`, 2026-08-20). The
    // marker is computed purely from open claims; `startTask` is the only writer
    // of one and sets the task `active` in the same transaction, while
    // `applyAssignment` (standing down) and `completeTask` close it as the task
    // leaves `active`. `blocked` only ever arises from `claimed`, so it cannot
    // reach `collisionByTask` at all.
    //
    // The fixture gives the blocked task NO claim *because no write path could
    // give it one*. An earlier version handed it one and asserted the marker was
    // suppressed — which pinned nothing: it passed with or without the code it
    // was meant to be testing.
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1')],
      tasks: [
        // claimed + an unmerged dependency ⇒ effective `blocked`, and no claim row
        task({
          id: 't1',
          featureId: 'f1',
          status: 'claimed',
          assigneeUserId: 'u1',
          deps: ['active'],
        }),
        task({ id: 't2', featureId: 'f1', status: 'active', claimedByUserId: 'u1' }),
        task({ id: 't3', featureId: 'f1', status: 'active', claimedByUserId: 'u2' }),
      ],
      claims: [
        { userId: 'u1', task: { id: 't2', title: 'T2', filesScope: ['src/a'] } },
        { userId: 'u2', task: { id: 't3', title: 'T3', filesScope: ['src/a/b'] } },
      ],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const all = board.lanes.flatMap((l) => l.tasks);
    const t1 = all.find((t) => t.id === 't1')!;
    expect(t1.status).toBe('blocked');
    expect(t1.collision).toBeNull();
    // The two that DO hold claims still mark each other, so the null above is
    // about t1's state rather than about nothing overlapping anywhere.
    expect(all.find((t) => t.id === 't2')!.collision).not.toBeNull();
    expect(all.find((t) => t.id === 't3')!.collision).not.toBeNull();
  });

  it('still flags a task pushed to ACTIVE past an unmerged dependency', async () => {
    // `computeEffectiveStatus` keeps a started task `active` regardless of deps,
    // so someone who pushed past the block is precisely who needs telling to
    // sequence, batch, or coordinate.
    setup({
      members: [member('u1'), member('u2')],
      features: [feature('f1', 'u1')],
      tasks: [
        task({
          id: 't1',
          featureId: 'f1',
          status: 'active',
          claimedByUserId: 'u1',
          deps: ['active'],
        }),
        task({ id: 't2', featureId: 'f1', status: 'active', claimedByUserId: 'u2' }),
      ],
      claims: [
        { userId: 'u1', task: { id: 't1', title: 'T1', filesScope: ['src/a'] } },
        { userId: 'u2', task: { id: 't2', title: 'T2', filesScope: ['src/a/b'] } },
      ],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    const t1 = laneOf(board, 'u1')!.tasks.find((t) => t.id === 't1')!;
    expect(t1.status).toBe('active');
    expect(t1.collision).not.toBeNull();
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
      tasks: [
        task({ id: 't1', featureId: 'f1', status: 'claimed', claimedByUserId: 'u1', number: 9 }),
      ],
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
        task({ id: 'a', featureId: 'f2', status: 'claimed', claimedByUserId: 'u2' }),
        task({ id: 'b', featureId: 'f1', status: 'claimed', claimedByUserId: 'u1' }),
        task({ id: 'c', featureId: 'f1', status: 'claimed', claimedByUserId: 'u1' }),
      ],
      users: [userRow('u1'), userRow('u2')],
    });
    const board = await getProjectBoard('u1', 'p1');
    // u1 holds 2 tasks, u2 holds 1 → u1 first.
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

describe('getProjectBoard — mergedAt on the card (§33-sweep t-108)', () => {
  it('serialises the merge instant as ISO, and null when never tracked', async () => {
    // The Board orders its Merged column on this; `null` is imported history
    // (§19's cutover predates the column), never "unmerged".
    setup({
      members: [member('u1', 'lead')],
      features: [feature('f1', 'u1', 'f-one')],
      tasks: [
        task({
          id: 'a',
          featureId: 'f1',
          status: 'merged',
          claimedByUserId: 'u1',
          mergedAt: new Date('2026-08-19T10:00:00.000Z'),
        }),
        task({ id: 'b', featureId: 'f1', status: 'merged', claimedByUserId: 'u1' }),
      ],
      users: [userRow('u1')],
    });

    const board = await getProjectBoard('u1', 'p1');
    const cards = laneOf(board, 'u1')!.tasks;
    expect(cards.find((c) => c.id === 'a')!.mergedAt).toBe('2026-08-19T10:00:00.000Z');
    expect(cards.find((c) => c.id === 'b')!.mergedAt).toBeNull();
  });
});

/**
 * Withdrawn work never reaches the Board (§21 t-123).
 *
 * Two independent defences, tested separately on purpose: the query excludes it, and
 * the routing loop skips it if one ever arrives anyway. The second is not decoration
 * — there is no honest `BoardColumn` for "not happening", and the pre-existing
 * `blocked → claimed` fold means the natural mistake is to let it drop into Claimed,
 * i.e. straight back into the pull queue.
 */
describe('getProjectBoard — withdrawn work (§21 t-123)', () => {
  it('excludes withdrawn tasks in the query, not after the fact', async () => {
    memberFindMany.mockResolvedValue([member('u1')]);
    featureFindMany.mockResolvedValue([feature('f1', 'u1')]);
    taskFindMany.mockResolvedValue([]);
    claimFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([userRow('u1')]);

    await getProjectBoard('u1', 'p1');

    expect(taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feature: { projectId: 'p1' }, withdrawnAt: null },
      })
    );
  });

  it('renders no card for a withdrawn task even if the query returns one', async () => {
    memberFindMany.mockResolvedValue([member('u1')]);
    featureFindMany.mockResolvedValue([feature('f1', 'u1')]);
    taskFindMany.mockResolvedValue([
      task({ id: 'live', featureId: 'f1', assigneeUserId: 'u1' }),
      task({
        id: 'gone',
        featureId: 'f1',
        assigneeUserId: 'u1',
        withdrawnAt: new Date('2026-08-21'),
      }),
    ]);
    claimFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([userRow('u1')]);

    const board = await getProjectBoard('u1', 'p1');

    const ids = board.lanes.flatMap((l) => l.tasks.map((t) => t.id));
    expect(ids).toEqual(['live']);
    // And it is not merely hidden from a lane — it must not be counted either, or
    // the column totals would advertise work no card exists for.
    expect(board.columnTotals.claimed).toBe(1);
  });
});
