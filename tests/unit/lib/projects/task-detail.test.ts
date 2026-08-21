/**
 * Unit: `getTaskDetail` — the single-task detail read (f-task-sheet t-1).
 *
 * Load-bearing assertions:
 *   - membership is the funnel's — `getAccessibleProject` deny → 404-not-403;
 *   - the task is loaded **scoped to the project** — a task in another project
 *     (a cross-project id-swap) is 404, and the access funnel runs first;
 *   - effective status is `computeEffectiveStatus` (deps-blocked available →
 *     blocked), for the task and for each dependency neighbour;
 *   - the two-way dep graph splits correctly: `dependencies.dependsOn` → blockedBy,
 *     `dependents.task` → blocks;
 *   - nullable refs (erased claimer / owner) resolve to `null`, never deref;
 *   - `prUrl` is returned raw (sanitized at render, per house pattern).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    task: { findFirst: vi.fn() },
    projectMember: { findMany: vi.fn() },
    taskClaim: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { getTaskDetail } = await import('@/lib/projects/task-detail');

const getAccessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const taskFindFirst = prisma.task.findFirst as ReturnType<typeof vi.fn>;
const memberFindMany = prisma.projectMember.findMany as ReturnType<typeof vi.fn>;
const claimFindMany = prisma.taskClaim.findMany as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

/** A dependency-graph neighbour (blocker or dependent). */
const neighbour = (o: {
  id: string;
  number?: number | null;
  status?: string;
  slug?: string | null;
  deps?: string[];
  claimedByUserId?: string | null;
  assigneeUserId?: string | null;
}) => ({
  id: o.id,
  number: o.number ?? null,
  title: o.id,
  status: o.status ?? 'claimed',
  claimedByUserId: o.claimedByUserId ?? null,
  assigneeUserId: o.assigneeUserId ?? null,
  feature: { slug: o.slug ?? null },
  dependencies: (o.deps ?? []).map((s) => ({ dependsOn: { status: s } })),
});

/** The main task row `findFirst` returns. */
const taskRow = (o: Record<string, unknown> = {}) => ({
  id: 't1',
  number: 1,
  title: 'Do the thing',
  description: 'desc',
  doneWhen: null,
  status: 'claimed',
  kind: 'feature_work',
  prUrl: null,
  filesScope: [],
  claimedByUserId: null,
  assigneeUserId: null,
  mergedByUserId: null,
  withdrawnAt: null,
  feature: { id: 'f1', slug: 'f-mcp', title: 'Feature one', ownerUserId: null },
  dependencies: [],
  dependents: [],
  ...o,
});

const userRow = (id: string) => ({ id, name: id.toUpperCase(), email: `${id}@x.io`, image: null });

beforeEach(() => {
  vi.clearAllMocks();
  getAccessible.mockResolvedValue({ id: 'p1' });
  memberFindMany.mockResolvedValue([]);
  claimFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
});

/** An open (unreleased) claim on another task, as the collision query returns it. */
const openClaim = (o: {
  id: string;
  userId?: string;
  number?: number | null;
  title?: string;
  files?: string[];
}) => ({
  userId: o.userId ?? 'u2',
  task: {
    id: o.id,
    number: o.number ?? null,
    title: o.title ?? o.id,
    filesScope: o.files ?? [],
  },
});

describe('getTaskDetail', () => {
  it('404s a non-member / unknown project via the funnel, before loading the task', async () => {
    getAccessible.mockRejectedValue(new NotFoundError('Project not found'));
    await expect(getTaskDetail('u1', 'p1', 't1')).rejects.toBeInstanceOf(NotFoundError);
    expect(taskFindFirst).not.toHaveBeenCalled();
  });

  it('404s a task that does not exist / lives in another project (cross-project id-swap)', async () => {
    taskFindFirst.mockResolvedValue(null); // scoped `feature.projectId` filtered it out
    await expect(getTaskDetail('u1', 'p1', 'tX')).rejects.toBeInstanceOf(NotFoundError);
    // The query is scoped to the accessible project.
    expect(taskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tX', feature: { projectId: 'p1' } } })
    );
  });

  it('returns real content (description + done-when + file scope) and raw prUrl', async () => {
    taskFindFirst.mockResolvedValue(
      taskRow({
        description: 'implement the widget',
        doneWhen: 'the widget renders',
        filesScope: ['lib/a.ts', 'lib/b.ts'],
        prUrl: 'javascript:alert(1)', // returned RAW — the component sanitizes
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.description).toBe('implement the widget');
    expect(detail.doneWhen).toBe('the widget renders'); // selected + surfaced (§21 t-c)
    expect(detail.filesScope).toEqual(['lib/a.ts', 'lib/b.ts']);
    expect(detail.prUrl).toBe('javascript:alert(1)');
  });

  it('surfaces the task kind (bug vs feature_work) for the sheet tag', async () => {
    taskFindFirst.mockResolvedValue(taskRow({ kind: 'bug' }));
    expect((await getTaskDetail('u1', 'p1', 't1')).kind).toBe('bug');
    taskFindFirst.mockResolvedValue(taskRow()); // default
    expect((await getTaskDetail('u1', 'p1', 't1')).kind).toBe('feature_work');
  });

  it('computes the task effective status (deps-blocked claimed → blocked)', async () => {
    taskFindFirst.mockResolvedValue(
      taskRow({
        status: 'claimed',
        dependencies: [{ dependsOn: neighbour({ id: 'b1', status: 'active' }) }], // dep not merged
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.status).toBe('blocked');
  });

  it('splits the dependency graph: dependencies → blockedBy, dependents → blocks, each with effective status', async () => {
    taskFindFirst.mockResolvedValue(
      taskRow({
        dependencies: [
          { dependsOn: neighbour({ id: 'b1', number: 2, slug: 'f-a', status: 'merged' }) },
        ],
        dependents: [
          {
            // a dependent that is itself deps-blocked → effective 'blocked'
            task: neighbour({ id: 'd1', number: 3, status: 'claimed', deps: ['claimed'] }),
          },
        ],
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.blockedBy).toEqual([
      { id: 'b1', number: 2, title: 'b1', featureSlug: 'f-a', status: 'merged', hasHolder: false },
    ]);
    expect(detail.blocks).toEqual([
      { id: 'd1', number: 3, title: 'd1', featureSlug: null, status: 'blocked', hasHolder: false },
    ]);
  });

  it('carries each neighbour’s hasHolder, so a dep chip can’t contradict its own row (§32 t-89)', async () => {
    taskFindFirst.mockResolvedValue(
      taskRow({
        dependencies: [
          // held by its assignee → the chip may say "assigned"
          { dependsOn: neighbour({ id: 'held', assigneeUserId: 'u2' }) },
          // a born-unassigned enhancement → the chip must say "unassigned"
          { dependsOn: neighbour({ id: 'free' }) },
        ],
      })
    );

    const detail = await getTaskDetail('u1', 'p1', 't1');

    expect(detail.blockedBy.map((d) => [d.id, d.hasHolder])).toEqual([
      ['held', true],
      ['free', false],
    ]);
  });

  it('reads a MERGED neighbour’s holder from the doer, not the assignee', async () => {
    // `taskHolderId` switches source at merged — credit follows who did it. A merged
    // task whose claimant was erased is nobody's, even if an assignee lingers.
    taskFindFirst.mockResolvedValue(
      taskRow({
        dependencies: [
          {
            dependsOn: neighbour({
              id: 'erased-doer',
              status: 'merged',
              claimedByUserId: null,
              assigneeUserId: 'u2',
            }),
          },
        ],
      })
    );

    const detail = await getTaskDetail('u1', 'p1', 't1');

    expect(detail.blockedBy[0].hasHolder).toBe(false);
  });

  it('resolves claimer + owner, marks isMine, and never derefs a null/erased ref', async () => {
    // owner o1 exists; claimer u1 (the caller) exists; a second task-less case covered elsewhere
    userFindMany.mockResolvedValue([userRow('u1'), userRow('o1')]);
    taskFindFirst.mockResolvedValue(
      taskRow({
        claimedByUserId: 'u1',
        feature: { id: 'f1', slug: 'f-mcp', title: 'Feature one', ownerUserId: 'o1' },
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.claimer?.id).toBe('u1');
    expect(detail.isMine).toBe(true);
    expect(detail.feature.owner?.id).toBe('o1');
  });

  it('renders an erased claimant / unowned feature as null (not a crash)', async () => {
    // claimant id present but the user row is gone (erased) → null, not undefined deref
    userFindMany.mockResolvedValue([]);
    taskFindFirst.mockResolvedValue(
      taskRow({
        claimedByUserId: 'ghost',
        feature: { id: 'f1', slug: null, title: 'Feature one', ownerUserId: null },
      })
    );
    const detail = await getTaskDetail('u2', 'p1', 't1');
    expect(detail.claimer).toBeNull();
    expect(detail.isMine).toBe(false);
    expect(detail.feature.owner).toBeNull();
  });

  it('resolves mergedBy (the GitHub merger mapped to a Hub user), distinct from the claimer', async () => {
    // The doer (u1) and the merger (m1) are different people — both resolved.
    userFindMany.mockResolvedValue([userRow('u1'), userRow('m1')]);
    taskFindFirst.mockResolvedValue(
      taskRow({ status: 'merged', claimedByUserId: 'u1', mergedByUserId: 'm1' })
    );
    const detail = await getTaskDetail('u2', 'p1', 't1');
    expect(detail.claimer?.id).toBe('u1'); // the doer
    expect(detail.mergedBy?.id).toBe('m1'); // the merger — additive, distinct
  });

  it('leaves mergedBy null when the PR merger is unmapped / the merge was human-driven', async () => {
    taskFindFirst.mockResolvedValue(taskRow({ status: 'merged', mergedByUserId: null }));
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.mergedBy).toBeNull();
  });

  it('resolves the assignee (the picker’s current value), independent of the claimer (§22 t2)', async () => {
    // The someone-else-started edge: assigned to a1, but actively claimed by u1.
    userFindMany.mockResolvedValue([userRow('u1'), userRow('a1')]);
    taskFindFirst.mockResolvedValue(
      taskRow({ status: 'active', claimedByUserId: 'u1', assigneeUserId: 'a1' })
    );
    const detail = await getTaskDetail('u2', 'p1', 't1');
    expect(detail.assignee?.id).toBe('a1');
    expect(detail.claimer?.id).toBe('u1'); // still the doer/claimant
  });

  it('exposes the project members as the picker’s options (membership order, erased dropped)', async () => {
    memberFindMany.mockResolvedValue([{ userId: 'm1' }, { userId: 'ghost' }, { userId: 'm2' }]);
    userFindMany.mockResolvedValue([userRow('m1'), userRow('m2')]); // 'ghost' erased
    taskFindFirst.mockResolvedValue(taskRow());
    const detail = await getTaskDetail('u1', 'p1', 't1');
    // Members query is scoped to the project + ordered by addedAt.
    expect(memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' }, orderBy: { addedAt: 'asc' } })
    );
    expect(detail.members.map((m) => m.id)).toEqual(['m1', 'm2']); // ghost dropped, order kept
  });

  it('keeps the current assignee in the picker options even after they leave the project', async () => {
    // 'gone' is the assignee but no longer a member — still shown so the picker
    // renders the current value (Board/Plan resolve them too), never "Unassigned".
    memberFindMany.mockResolvedValue([{ userId: 'm1' }]);
    userFindMany.mockResolvedValue([userRow('m1'), userRow('gone')]); // 'gone' still exists as a user
    taskFindFirst.mockResolvedValue(taskRow({ assigneeUserId: 'gone' }));
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.assignee?.id).toBe('gone');
    // Members (m1) + the current assignee appended (so the Select has its value).
    expect(detail.members.map((m) => m.id)).toEqual(['m1', 'gone']);
  });
});

describe('getTaskDetail — overlapping claims (§33-sweep t-109)', () => {
  it('names the overlapping task, its holder, and which declared paths collide', async () => {
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: ['lib/projects/collision.ts'] }));
    claimFindMany.mockResolvedValue([
      openClaim({ id: 't9', number: 9, title: 'Other work', files: ['lib/projects/**'] }),
    ]);
    userFindMany.mockResolvedValue([userRow('u2')]);
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.collisions).toEqual([
      {
        taskId: 't9',
        number: 9,
        title: 'Other work',
        holder: userRow('u2'),
        isMine: false,
        // *This* task's entry, not the other's — the reader recognises their own
        // declared path; `lib/projects/**` would name a scope they never wrote.
        paths: ['lib/projects/collision.ts'],
      },
    ]);
  });

  it('only matches thanks to the wildcard normalisation (t-114)', async () => {
    // The pairing above is glob-vs-file: before t-114 this returned nothing at
    // all, which is precisely why the sheet had nothing to show.
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: ['components/hub/a.tsx'] }));
    claimFindMany.mockResolvedValue([openClaim({ id: 't9', files: ['components/hub/**'] })]);
    userFindMany.mockResolvedValue([userRow('u2')]);
    expect((await getTaskDetail('u1', 'p1', 't1')).collisions).toHaveLength(1);
  });

  it('reports an overlapping claim held by the VIEWER, flagged rather than hidden', async () => {
    // Two of your own tasks over the same files is a real merge conflict ahead,
    // and in a single-member project filtering this leaves the feature inert.
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: ['lib/a.ts'] }));
    claimFindMany.mockResolvedValue([openClaim({ id: 't9', userId: 'u1', files: ['lib/a.ts'] })]);
    userFindMany.mockResolvedValue([userRow('u1')]);
    const [collision] = (await getTaskDetail('u1', 'p1', 't1')).collisions;
    expect(collision.isMine).toBe(true);
  });

  it('excludes the task under read from its own collision query', async () => {
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: ['lib/a.ts'] }));
    await getTaskDetail('u1', 'p1', 't1');
    expect(claimFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          releasedAt: null,
          taskId: { not: 't1' },
          // Scope-less claims are excluded in the QUERY: they can never overlap,
          // and `get_task` reuses this read while projecting `collisions` away
          // entirely, so fetching them would be pure cost (`/code-review`).
          // `withdrawnAt: null` because withdrawing does NOT release the task's
          // claim (§21 t-123) — that is what keeps restore free — so a withdrawn
          // task would otherwise go on contesting files for work nobody will do.
          task: {
            feature: { projectId: 'p1' },
            filesScope: { isEmpty: false },
            withdrawnAt: null,
          },
        },
      })
    );
  });

  it('reports one entry per overlapping TASK, not per claim row', async () => {
    // `startTask` releases-then-creates in a single transaction, but under READ
    // COMMITTED two concurrent starts can each take a snapshot before the other's
    // INSERT is visible, leaving two open claims on one task. `board.ts`'s pairwise
    // pass already carries its own `a.id === b.id` guard for exactly this. Undeduped,
    // the sheet renders the same task twice under a duplicate React key.
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: ['lib/a.ts'] }));
    claimFindMany.mockResolvedValue([
      openClaim({ id: 't9', userId: 'u2', files: ['lib/a.ts'] }),
      openClaim({ id: 't9', userId: 'u3', files: ['lib/a.ts'] }),
    ]);
    userFindMany.mockResolvedValue([userRow('u2'), userRow('u3')]);
    const { collisions } = await getTaskDetail('u1', 'p1', 't1');
    expect(collisions).toHaveLength(1);
    expect(collisions[0].taskId).toBe('t9');
    // The query orders by `claimedAt asc` and the Map keeps the last write, so the
    // survivor is the most RECENT claimant — who actually holds it now.
    expect(collisions[0].holder?.id).toBe('u3');
  });

  it('stays quiet when the task declares no scope, or nothing overlaps', async () => {
    claimFindMany.mockResolvedValue([openClaim({ id: 't9', files: ['lib/a.ts'] })]);
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: [] }));
    expect((await getTaskDetail('u1', 'p1', 't1')).collisions).toEqual([]);
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: ['web/home.tsx'] }));
    expect((await getTaskDetail('u1', 'p1', 't1')).collisions).toEqual([]);
  });

  it('stays quiet while WITHDRAWN — nothing about file contention is actionable', async () => {
    // The third silence, alongside merged and blocked (§21 t-123). "Be careful of
    // these files" adds nothing to "this work is not happening", and unlike the
    // other two it is the strongest can't-start signal of the set.
    claimFindMany.mockResolvedValue([openClaim({ id: 't9', files: ['lib/a.ts'] })]);
    userFindMany.mockResolvedValue([userRow('u2')]);
    taskFindFirst.mockResolvedValue(
      taskRow({ status: 'claimed', filesScope: ['lib/a.ts'], withdrawnAt: new Date('2026-08-21') })
    );

    const d = await getTaskDetail('u1', 'p1', 't1');

    expect(d.status).toBe('withdrawn');
    expect(d.collisions).toEqual([]);
  });

  it('stays quiet while BLOCKED, and speaks up the moment the block clears', async () => {
    // Owner, 2026-08-20: an unmerged dependency already stops this task, that
    // stop is rendered directly below, and the dependency is frequently the very
    // task the warning would name. Both halves asserted from one fixture, so the
    // suppression is pinned to the block rather than to some other difference.
    claimFindMany.mockResolvedValue([openClaim({ id: 't9', files: ['lib/a.ts'] })]);
    userFindMany.mockResolvedValue([userRow('u2')]);

    taskFindFirst.mockResolvedValue(
      taskRow({
        status: 'claimed',
        filesScope: ['lib/a.ts'],
        dependencies: [{ dependsOn: neighbour({ id: 'b1', status: 'active' }) }],
      })
    );
    const blocked = await getTaskDetail('u1', 'p1', 't1');
    expect(blocked.status).toBe('blocked');
    expect(blocked.collisions).toEqual([]);

    taskFindFirst.mockResolvedValue(
      taskRow({
        status: 'claimed',
        filesScope: ['lib/a.ts'],
        dependencies: [{ dependsOn: neighbour({ id: 'b1', status: 'merged' }) }],
      })
    );
    const ready = await getTaskDetail('u1', 'p1', 't1');
    expect(ready.status).toBe('claimed');
    expect(ready.collisions).toHaveLength(1);
  });

  it('still warns a task pushed to ACTIVE past an unmerged dependency', async () => {
    // A started task stays `active` whatever its deps say, and someone who
    // pushed past the block is exactly who needs to sequence or coordinate.
    taskFindFirst.mockResolvedValue(
      taskRow({
        status: 'active',
        filesScope: ['lib/a.ts'],
        dependencies: [{ dependsOn: neighbour({ id: 'b1', status: 'active' }) }],
      })
    );
    claimFindMany.mockResolvedValue([openClaim({ id: 't9', files: ['lib/a.ts'] })]);
    userFindMany.mockResolvedValue([userRow('u2')]);
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.status).toBe('active');
    expect(detail.collisions).toHaveLength(1);
  });

  it('stays quiet once the task has MERGED — nothing left to coordinate', async () => {
    taskFindFirst.mockResolvedValue(taskRow({ status: 'merged', filesScope: ['lib/a.ts'] }));
    claimFindMany.mockResolvedValue([openClaim({ id: 't9', files: ['lib/a.ts'] })]);
    userFindMany.mockResolvedValue([userRow('u2')]);
    expect((await getTaskDetail('u1', 'p1', 't1')).collisions).toEqual([]);
  });

  it('renders an ERASED holder as null rather than dereferencing them', async () => {
    // The claim outlives the user row; the funnel's rule is resolve-or-null.
    taskFindFirst.mockResolvedValue(taskRow({ filesScope: ['lib/a.ts'] }));
    claimFindMany.mockResolvedValue([
      openClaim({ id: 't9', userId: 'ghost', files: ['lib/a.ts'] }),
    ]);
    userFindMany.mockResolvedValue([]); // 'ghost' no longer exists
    const [collision] = (await getTaskDetail('u1', 'p1', 't1')).collisions;
    expect(collision.holder).toBeNull();
    expect(collision.taskId).toBe('t9');
  });
});
