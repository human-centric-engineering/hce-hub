/**
 * Tests for `lib/projects/feature-detail.ts` — the feature-page read. Pins the
 * funnel (deny ≡ 404 via getAccessibleProjectByRef), slug-or-cuid resolution of
 * BOTH the project segment and the feature key, scoping to the resolved
 * project's canonical id (cross-project 404), the references JSON guard,
 * effective task status, null owner/claimer/assignee (never a deref), and the
 * indicative sketch.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProjectByRef: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    feature: { findFirst: vi.fn() },
    projectMember: { findMany: vi.fn() },
    projectEvent: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/projects/user-refs', () => ({ fetchUsers: vi.fn() }));

const { getAccessibleProjectByRef } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { fetchUsers } = await import('@/lib/projects/user-refs');
const { NotFoundError } = await import('@/lib/api/errors');
const { getFeatureDetail } = await import('@/lib/projects/feature-detail');

const access = getAccessibleProjectByRef as ReturnType<typeof vi.fn>;
const featureFindFirst = prisma.feature.findFirst as ReturnType<typeof vi.fn>;
const memberFindMany = prisma.projectMember.findMany as ReturnType<typeof vi.fn>;
type EventQuery = { where: { kind: string } };
const eventFindMany = prisma.projectEvent.findMany as unknown as Mock<
  (args: EventQuery) => Promise<unknown[]>
>;
const users = fetchUsers as ReturnType<typeof vi.fn>;

const USER = 'user-1';

const featureRow = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  number: null,
  slug: 'f-mcp',
  title: 'MCP server',
  description: 'Expose tools',
  doneWhen: 'tools/list works',
  references: [{ label: 'spec', target: 'https://x.io' }],
  status: 'in_flight',
  planningStage: 'planned',
  helpWanted: false,
  ownerUserId: null,
  dependencies: [],
  tasks: [],
  indicativeTasks: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ id: 'p1', slug: 'hce-hub', name: 'HCE Hub' });
  memberFindMany.mockResolvedValue([]);
  users.mockResolvedValue(new Map());
  eventFindMany.mockResolvedValue([]);
});

describe('getFeatureDetail funnel', () => {
  it('propagates the funnel 404 (non-member/unknown project) and never queries', async () => {
    access.mockRejectedValue(new NotFoundError('Project p1 not found'));
    await expect(getFeatureDetail(USER, 'p1', 'f-mcp')).rejects.toBeInstanceOf(NotFoundError);
    expect(featureFindFirst).not.toHaveBeenCalled();
  });

  it('404s an unknown feature / one in another project', async () => {
    featureFindFirst.mockResolvedValue(null);
    await expect(getFeatureDetail(USER, 'p1', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resolves by slug OR cuid, scoped to the confirmed project', async () => {
    featureFindFirst.mockResolvedValue(featureRow());
    await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(featureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', OR: [{ slug: 'f-mcp' }, { id: 'f-mcp' }] },
      })
    );
  });

  it('resolves a SLUG project segment via getAccessibleProjectByRef, scoping the feature lookup to the resolved canonical id (§19)', async () => {
    access.mockResolvedValue({ id: 'p1', slug: 'hce-hub', name: 'HCE Hub' });
    featureFindFirst.mockResolvedValue(featureRow());
    await getFeatureDetail(USER, 'hce-hub', 'f-mcp');
    // The raw ref goes to the access funnel; the feature query is scoped to the
    // *resolved* canonical id, never the raw (possibly slug) ref.
    expect(access).toHaveBeenCalledWith(USER, 'hce-hub');
    expect(featureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', OR: [{ slug: 'f-mcp' }, { id: 'f-mcp' }] },
      })
    );
  });

  it('returns the canonical project.id as projectId, not the raw slug ref', async () => {
    access.mockResolvedValue({ id: 'p1', slug: 'hce-hub', name: 'HCE Hub' });
    featureFindFirst.mockResolvedValue(featureRow());
    const detail = await getFeatureDetail(USER, 'hce-hub', 'f-mcp');
    expect(detail.projectId).toBe('p1');
  });
});

describe('getFeatureDetail mapping', () => {
  it('returns the header, project name, references, and indicative sketch', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({
        planningStage: 'indicative',
        indicativeTasks: [{ id: 'i1', order: 0, text: 'draft schema' }],
      })
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.projectName).toBe('HCE Hub');
    expect(detail.projectSlug).toBe('hce-hub');
    expect(detail.slug).toBe('f-mcp');
    expect(detail.planningStage).toBe('indicative');
    expect(detail.references).toEqual([{ label: 'spec', target: 'https://x.io' }]);
    expect(detail.indicativeTasks).toEqual([{ id: 'i1', order: 0, text: 'draft schema' }]);
    expect(detail.owner).toBeNull();
  });

  it('returns a null projectSlug when the project has none (back-link falls back to projectId)', async () => {
    access.mockResolvedValue({ id: 'p1', slug: null, name: 'HCE Hub' });
    featureFindFirst.mockResolvedValue(featureRow());
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.projectSlug).toBeNull();
  });

  it('drops malformed reference entries (JSON guard)', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({
        references: [
          { label: 'ok', target: 'https://x.io' },
          { label: 'no target' },
          'not an object',
          { label: 42, target: 'x' },
        ],
      })
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.references).toEqual([{ label: 'ok', target: 'https://x.io' }]);
  });

  it('treats a non-array references value as empty', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ references: null }));
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.references).toEqual([]);
  });

  it('computes effective task status and resolves claimer + assignee, null-safe', async () => {
    users.mockResolvedValue(
      new Map([
        ['owner-1', { id: 'owner-1', name: 'Ada', email: 'a@x.io', image: null }],
        ['claim-1', { id: 'claim-1', name: 'Bo', email: 'b@x.io', image: null }],
      ])
    );
    featureFindFirst.mockResolvedValue(
      featureRow({
        ownerUserId: 'owner-1',
        tasks: [
          {
            id: 't1',
            number: 1,
            title: 'blocked task',
            status: 'claimed',
            kind: 'bug',
            doneWhen: 'ok',
            prUrl: null,
            claimedByUserId: null,
            assigneeUserId: 'gone', // erased → not in the users map → null
            dependencies: [{ dependsOn: { status: 'claimed' } }], // unmerged dep → blocked
          },
          {
            id: 't2',
            number: 2,
            title: 'claimed task',
            status: 'claimed',
            kind: 'feature_work',
            doneWhen: null,
            prUrl: null,
            claimedByUserId: 'claim-1',
            assigneeUserId: null,
            dependencies: [],
          },
        ],
      })
    );

    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.owner).toEqual({ id: 'owner-1', name: 'Ada', email: 'a@x.io', image: null });
    expect(detail.tasks[0].status).toBe('blocked'); // dep not merged
    expect(detail.tasks[0].kind).toBe('bug'); // surfaced for the feature-page bug tag
    expect(detail.tasks[0].assignee).toBeNull(); // erased assignee never derefs
    expect(detail.tasks[1].status).toBe('claimed');
    expect(detail.tasks[1].kind).toBe('feature_work');
    expect(detail.tasks[1].claimer?.name).toBe('Bo');
  });

  it('exposes the project members as the reassign picker’s options (order kept, erased dropped)', async () => {
    memberFindMany.mockResolvedValue([{ userId: 'm1' }, { userId: 'ghost' }, { userId: 'm2' }]);
    users.mockResolvedValue(
      new Map([
        ['m1', { id: 'm1', name: 'Ada', email: 'a@x.io', image: null }],
        ['m2', { id: 'm2', name: 'Bo', email: 'b@x.io', image: null }],
      ])
    );
    featureFindFirst.mockResolvedValue(featureRow());
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' }, orderBy: { addedAt: 'asc' } })
    );
    expect(detail.members.map((m) => m.id)).toEqual(['m1', 'm2']); // ghost dropped, order kept
  });
});

describe('getFeatureDetail — readiness-derived feature status (f-status-model §20 t-37)', () => {
  it('derives "available" for a not-started feature whose dependencies are all shipped', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({
        status: 'planning',
        dependencies: [
          { dependsOn: { id: 'd1', slug: 'f-dep', title: 'Dependency', status: 'shipped' } },
        ],
      })
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.status).toBe('available');
    expect(detail.waitingOn).toEqual([]);
  });

  it('derives "blocked" naming the unshipped dependency it is waiting on', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({
        status: 'planning',
        dependencies: [
          { dependsOn: { id: 'd1', slug: 'f-dep', title: 'Dependency', status: 'in_flight' } },
        ],
      })
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.status).toBe('blocked');
    expect(detail.waitingOn).toEqual([{ slug: 'f-dep', title: 'Dependency' }]);
  });

  it('keeps in_flight/shipped through unchanged when there is nothing outstanding', async () => {
    featureFindFirst.mockResolvedValueOnce(
      featureRow({
        status: 'in_flight',
        dependencies: [
          { dependsOn: { id: 'd1', slug: 'f-done', title: 'Shipped dep', status: 'shipped' } },
        ],
      })
    );
    let detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.status).toBe('in_flight');
    expect(detail.waitingOn).toEqual([]);

    featureFindFirst.mockResolvedValueOnce(featureRow({ status: 'shipped' }));
    detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.status).toBe('shipped');
  });

  it('blocks a CLAIMED (in_flight) feature with an unshipped dep — the t-39 overlay', async () => {
    featureFindFirst.mockResolvedValueOnce(
      featureRow({
        status: 'in_flight',
        dependencies: [
          { dependsOn: { id: 'd1', slug: 'f-dep', title: 'Un-started dep', status: 'planning' } },
        ],
      })
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.status).toBe('blocked');
    expect(detail.waitingOn).toEqual([{ slug: 'f-dep', title: 'Un-started dep' }]);
  });

  it('never surfaces the raw stored "planning" status on the payload', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ status: 'planning' }));
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.status).not.toBe('planning');
  });

  it('carries the stable feature number', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ number: 12 }));
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.number).toBe(12);
  });
});

/**
 * §33 t-100 — phase boundaries inside the task list.
 *
 * The split keys off when each task **merged**, read from the `task_merged`
 * event because `Task` has no merged-at column, and NOT off `createdAt`: a
 * feature is normally planned in full and re-homed later, so a creation-time
 * split would draw nothing in the exact case this exists for.
 */
describe('getFeatureDetail — phase boundaries (§33 t-100)', () => {
  const taskRow = (id: string, number: number) => ({
    id,
    number,
    title: `task ${number}`,
    status: 'merged',
    kind: 'feature_work',
    doneWhen: null,
    prUrl: null,
    claimedByUserId: null,
    assigneeUserId: null,
    dependencies: [],
  });

  const move = (at: string, from: string | null, to: string | null) => ({
    createdAt: new Date(at),
    metadata: { subject: 'feature', fromPhaseName: from, toPhaseName: to },
  });

  const merged = (taskId: string, at: string) => ({ taskId, createdAt: new Date(at) });

  /** Dispatch the two event reads by the `kind` each one asks for. */
  const withEvents = (moves: unknown[], merges: unknown[]) => {
    eventFindMany.mockImplementation((args: EventQuery) =>
      Promise.resolve(args.where.kind === 'phase_membership_changed' ? moves : merges)
    );
  };

  it('returns no boundaries, in the original order, for a feature that never moved', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1), taskRow('t2', 2)] }));
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.taskPhaseBoundaries).toEqual([]);
    expect(detail.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    // The merge-time read costs nothing when there is nothing to place.
    expect(eventFindMany).toHaveBeenCalledTimes(1);
    expect(eventFindMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ kind: 'task_merged' }) })
    );
  });

  it('reads no events at all for a feature with no real tasks', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({ planningStage: 'indicative', tasks: [], indicativeTasks: [] })
    );
    await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(eventFindMany).not.toHaveBeenCalled();
  });

  it('splits on MERGE time, not creation time, and names the phase on each side', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1), taskRow('t2', 2)] }));
    withEvents(
      [move('2026-08-10T12:00:00.000Z', 'Project flow', 'Sunrise Management')],
      [merged('t1', '2026-08-09T09:00:00.000Z'), merged('t2', '2026-08-11T09:00:00.000Z')]
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.taskPhaseBoundaries).toEqual([
      {
        beforeTaskId: 't2',
        fromPhaseName: 'Project flow',
        toPhaseName: 'Sunrise Management',
        movedAt: '2026-08-10T12:00:00.000Z',
      },
    ]);
  });

  it('places an unmerged task in the FINAL band — after the move, never dropped', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({
        tasks: [taskRow('t1', 1), { ...taskRow('t2', 2), status: 'active' }],
      })
    );
    withEvents(
      [move('2026-08-10T12:00:00.000Z', 'Project flow', 'Sunrise Management')],
      [merged('t1', '2026-08-09T09:00:00.000Z')] // t2 never merged
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(detail.taskPhaseBoundaries[0]?.beforeTaskId).toBe('t2');
  });

  it('regroups rows when merge order disagrees with t-N order', async () => {
    // Not hypothetical: f-work-kinds merged t-89 nine hours BEFORE t-88. A single
    // divider dropped into a number-ordered list would put t-88 on the wrong side.
    featureFindFirst.mockResolvedValue(
      featureRow({ tasks: [taskRow('t88', 88), taskRow('t89', 89), taskRow('t90', 90)] })
    );
    withEvents(
      [move('2026-08-14T18:00:00.000Z', 'Project flow', 'Sunrise Management')],
      [
        merged('t89', '2026-08-14T14:28:00.000Z'),
        merged('t88', '2026-08-14T23:12:00.000Z'),
        merged('t90', '2026-08-15T08:43:00.000Z'),
      ]
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.tasks.map((t) => t.id)).toEqual(['t89', 't88', 't90']);
    expect(detail.taskPhaseBoundaries[0]?.beforeTaskId).toBe('t88');
  });

  it('keeps t-N order WITHIN a band (the sort is stable)', async () => {
    featureFindFirst.mockResolvedValue(
      featureRow({ tasks: [taskRow('t1', 1), taskRow('t2', 2), taskRow('t3', 3)] })
    );
    withEvents(
      [move('2026-08-10T12:00:00.000Z', 'A', 'B')],
      [
        // t2 and t3 both land after the move, t2 merging last of the three.
        merged('t1', '2026-08-09T09:00:00.000Z'),
        merged('t3', '2026-08-11T09:00:00.000Z'),
        merged('t2', '2026-08-12T09:00:00.000Z'),
      ]
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.tasks.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('ignores a TASK commitment marker — only the feature moving draws a boundary', async () => {
    // `phase_membership_changed` also records a single task being committed to a
    // phase (§32 t-80), and those events carry this feature's id so the Log can
    // chip them. Without the subject filter, one committed task would draw a
    // boundary across the whole feature.
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1), taskRow('t2', 2)] }));
    withEvents(
      [
        {
          createdAt: new Date('2026-08-10T12:00:00.000Z'),
          metadata: { subject: 'task', fromPhaseName: 'A', toPhaseName: 'B' },
        },
      ],
      [merged('t1', '2026-08-09T09:00:00.000Z'), merged('t2', '2026-08-11T09:00:00.000Z')]
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.taskPhaseBoundaries).toEqual([]);
    expect(detail.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('ignores malformed metadata rather than fabricating a move (JSON guard)', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1)] }));
    withEvents(
      [
        { createdAt: new Date('2026-08-10T12:00:00.000Z'), metadata: null },
        { createdAt: new Date('2026-08-10T12:00:00.000Z'), metadata: 'not an object' },
        { createdAt: new Date('2026-08-10T12:00:00.000Z'), metadata: [{ subject: 'feature' }] },
        { createdAt: new Date('2026-08-10T12:00:00.000Z'), metadata: {} },
      ],
      []
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.taskPhaseBoundaries).toEqual([]);
  });

  it('carries a null phase name through for an unfiled side', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1)] }));
    withEvents([move('2026-08-10T12:00:00.000Z', null, 'Project flow')], []);
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.taskPhaseBoundaries[0]).toMatchObject({
      fromPhaseName: null,
      toPhaseName: 'Project flow',
    });
  });

  it('anchors a boundary to null when every task was already merged before the move', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1)] }));
    withEvents(
      [move('2026-08-20T12:00:00.000Z', 'Project flow', 'Ideas Park')],
      [merged('t1', '2026-08-09T09:00:00.000Z')]
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    expect(detail.taskPhaseBoundaries[0]?.beforeTaskId).toBeNull();
  });

  it('stacks two boundaries on one anchor when no work completed between the moves', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1), taskRow('t2', 2)] }));
    withEvents(
      [move('2026-08-10T12:00:00.000Z', 'A', 'B'), move('2026-08-10T18:00:00.000Z', 'B', 'C')],
      [merged('t1', '2026-08-09T09:00:00.000Z'), merged('t2', '2026-08-11T09:00:00.000Z')]
    );
    const detail = await getFeatureDetail(USER, 'p1', 'f-mcp');
    // Neither move is swallowed: both land above t2, in order.
    expect(detail.taskPhaseBoundaries.map((b) => [b.fromPhaseName, b.toPhaseName])).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ]);
    expect(detail.taskPhaseBoundaries.every((b) => b.beforeTaskId === 't2')).toBe(true);
  });

  it('scopes both event reads to the resolved project AND this feature', async () => {
    featureFindFirst.mockResolvedValue(featureRow({ tasks: [taskRow('t1', 1)] }));
    withEvents([move('2026-08-10T12:00:00.000Z', 'A', 'B')], []);
    await getFeatureDetail(USER, 'hce-hub', 'f-mcp');
    for (const kind of ['phase_membership_changed', 'task_merged']) {
      expect(eventFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: 'p1', featureId: 'f1', kind }),
        })
      );
    }
  });
});
