/**
 * Tests for `lib/projects/capabilities/next-task.ts`.
 *
 * next_task is membership-scoped and dependency-aware, so its matrix is the
 * load-bearing test: no-user guard, project scoping through the f-access funnel
 * (deny ≡ not_found), the owned-vs-help-wanted candidate set, and the readiness
 * filter (skips blocked/active/merged, picking an effective `claimed` task —
 * f-status-model §20, where the claimant no longer gates readiness).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskStatus, TaskKind } from '@prisma/client';

vi.mock('@/lib/db/client', () => ({
  prisma: { task: { findMany: vi.fn() } },
}));
vi.mock('@/lib/projects/access', () => ({
  canAccessProject: vi.fn(),
  accessibleProjectIds: vi.fn(),
}));

const { prisma } = await import('@/lib/db/client');
const access = await import('@/lib/projects/access');
const { NextTaskCapability } = await import('@/lib/projects/capabilities/next-task');

const findMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const canAccessProject = access.canAccessProject as ReturnType<typeof vi.fn>;
const accessibleProjectIds = access.accessibleProjectIds as ReturnType<typeof vi.fn>;

const cap = new NextTaskCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'agent-1' });

/**
 * A candidate task in the `select` shape next-task queries.
 *
 * `ownerUserId` defaults to the caller, so a bare `task()` is work on a feature you
 * own — the only kind of candidate that existed before §32 t-90. That keeps every
 * pre-t-90 test exercising the tier it was written against (see the focus-policy
 * block below for the commons).
 */
function task(opts: {
  id: string;
  status?: TaskStatus;
  kind?: TaskKind;
  claimedByUserId?: string | null;
  assigneeUserId?: string | null;
  /** The owner of the task's feature; defaults to the caller. `null` = nobody's. */
  ownerUserId?: string | null;
  deps?: TaskStatus[];
  projectId?: string;
  /** Withdrawn work never reaches this query — present so a test can prove it. */
  withdrawnAt?: Date | null;
}) {
  return {
    id: opts.id,
    number: 5,
    title: `task ${opts.id}`,
    featureId: `feat-${opts.id}`,
    filesScope: [],
    prUrl: null,
    status: opts.status ?? 'claimed',
    kind: opts.kind ?? 'feature_work',
    claimedByUserId: opts.claimedByUserId ?? null,
    assigneeUserId: opts.assigneeUserId ?? null,
    feature: {
      projectId: opts.projectId ?? 'proj-1',
      slug: `f-${opts.id}`,
      ownerUserId: opts.ownerUserId === undefined ? USER : opts.ownerUserId,
    },
    withdrawnAt: opts.withdrawnAt ?? null,
    dependencies: (opts.deps ?? []).map((status) => ({
      dependsOn: { status, withdrawnAt: null },
    })),
  };
}

/**
 * The three "your work" arms of the query (§32 t-90) — a feature you own, plus a
 * task assigned to or held by you on anyone's feature. Spelled out here so the
 * scoping tests below assert the whole `where`, not a fragment of it.
 */
const ownArms = (projectId: unknown) => [
  { feature: { projectId, ownerUserId: USER } },
  { assigneeUserId: USER, feature: { projectId } },
  { claimedByUserId: USER, feature: { projectId } },
];
/** The unclaimed pool: held by nobody. */
const commonsArm = (projectId: unknown) => ({
  assigneeUserId: null,
  claimedByUserId: null,
  feature: { projectId },
});
/** Opted-in commons — deliberately assignment-blind, so it stays a widening. */
const helpWantedArm = (projectId: unknown) => ({ feature: { projectId, helpWanted: true } });
/**
 * Merged work is dropped at the DB rather than client-side: since t-90 the commons
 * arm spans whole projects, so without it the query drags back every finished task
 * in every accessible project. Result-preserving — the pullable filter already
 * excluded them — but it keeps `consideredCount` meaning "candidates".
 */
const NOT_MERGED = { not: 'merged' };
/**
 * Withdrawn work is dropped at the DB for the same reason merged work is (§21
 * t-123): the pullable filter would drop it anyway, but only after dragging its
 * dependency rows back — and `consideredCount` would count work nobody can do.
 * Asserted as part of the whole `where` so removing it fails these tests rather
 * than silently re-offering called-off work.
 */
const NOT_WITHDRAWN = null;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('next_task guards', () => {
  it('errors with no_user_context for a system-initiated (null-user) run', async () => {
    const r = await cap.execute({}, ctx(null));
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('no_user_context');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns null (not an error) when the caller is a member of no projects', async () => {
    accessibleProjectIds.mockResolvedValue([]);
    const r = await cap.execute({}, ctx());
    expect(r).toEqual({ success: true, data: { task: null, consideredCount: 0 } });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('next_task project scoping (f-access funnel)', () => {
  it('scopes to every accessible project when no projectId is given', async () => {
    accessibleProjectIds.mockResolvedValue(['p1', 'p2']);
    findMany.mockResolvedValue([task({ id: 'a' })]);

    await cap.execute({}, ctx());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: NOT_MERGED,
          withdrawnAt: NOT_WITHDRAWN,
          OR: [...ownArms({ in: ['p1', 'p2'] }), commonsArm({ in: ['p1', 'p2'] })],
        },
      })
    );
  });

  it('returns not_found for a project the caller is not a member of (deny ≡ 404)', async () => {
    canAccessProject.mockResolvedValue({ ok: false, basis: null });
    const r = await cap.execute({ projectId: 'secret' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns forbidden (not 404) if the funnel denies a member — never leaking as not_found', async () => {
    // Defensive: a member who lacks the required role is a 403, not a 404 (they
    // can see the project). next_task's default 'view' need never trips this, but
    // the funnel contract is uniform across every capability, so exercise it.
    canAccessProject.mockResolvedValue({ ok: false, basis: 'member' });
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('forbidden');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes to the one project when the caller is a member', async () => {
    canAccessProject.mockResolvedValue({ ok: true, basis: 'member' });
    findMany.mockResolvedValue([]);

    await cap.execute({ projectId: 'p1' }, ctx());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: NOT_MERGED,
          withdrawnAt: NOT_WITHDRAWN,
          OR: [...ownArms('p1'), commonsArm('p1')],
        },
      })
    );
  });

  it('widens the candidate set to help-wanted features when asked', async () => {
    accessibleProjectIds.mockResolvedValue(['p1']);
    findMany.mockResolvedValue([]);

    await cap.execute({ includeHelpWanted: true }, ctx());

    const scope = { in: ['p1'] };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: NOT_MERGED,
          withdrawnAt: NOT_WITHDRAWN,
          OR: [...ownArms(scope), commonsArm(scope), helpWantedArm(scope)],
        },
      })
    );
  });

  /**
   * The load-bearing security invariant of §32 t-90. Widening the pool from "features
   * you own" to "…plus the commons" added arms that match on task-level fields
   * (`assigneeUserId`, `claimedByUserId`) rather than on ownership — and an arm that
   * forgot its project scope would match those fields across **every project in the
   * database**, handing a caller a task from a project they aren't a member of.
   * Asserted structurally so a sixth arm can't be added unscoped.
   */
  it.each([
    ['default', {}],
    ['with help-wanted', { includeHelpWanted: true }],
  ])('scopes every arm of the widened OR to the caller’s projects (%s)', async (_label, args) => {
    accessibleProjectIds.mockResolvedValue(['p1', 'p2']);
    findMany.mockResolvedValue([]);

    await cap.execute(args, ctx());

    const where = findMany.mock.calls[0][0].where as { OR: Record<string, unknown>[] };
    expect(where.OR.length).toBeGreaterThanOrEqual(4);
    for (const arm of where.OR) {
      expect(arm.feature).toMatchObject({ projectId: { in: ['p1', 'p2'] } });
    }
  });

  it('leaves help-wanted out of the query unless asked', async () => {
    accessibleProjectIds.mockResolvedValue(['p1']);
    findMany.mockResolvedValue([]);

    await cap.execute({}, ctx());

    const where = findMany.mock.calls[0][0].where as { OR: unknown[] };
    expect(where.OR).not.toContainEqual(helpWantedArm({ in: ['p1'] }));
  });
});

/**
 * The focus policy (§32 t-90). Before it, candidates were only ever tasks on
 * features the caller owned; the commons — the unclaimed pool t-89 made real — was
 * invisible to the agent while a human could see it in the Board's Unassigned lane.
 *
 * Ordering is the owner's call: **own work first**, because the default posture is
 * heads-down on your own feature. A bug sweep is a different mode, and one the
 * dynamic-focus work will make selectable rather than something `next_task` decides
 * for you today.
 */
describe('next_task focus policy — own work before the commons', () => {
  beforeEach(() => {
    accessibleProjectIds.mockResolvedValue(['p1']);
  });

  const pick = async () => (await cap.execute({}, ctx())).data?.task?.id;

  it('offers your own work ahead of an older unclaimed task', async () => {
    // The commons task sorts FIRST out of the DB (older feature), so only the tier
    // split can put the owned one ahead of it.
    findMany.mockResolvedValue([
      task({ id: 'commons', ownerUserId: 'someone-else' }),
      task({ id: 'mine' }),
    ]);
    expect(await pick()).toBe('mine');
  });

  it('offers the commons once none of your own work is ready', async () => {
    findMany.mockResolvedValue([
      task({ id: 'mine-blocked', deps: ['claimed'] }),
      task({ id: 'commons', ownerUserId: 'someone-else' }),
    ]);
    expect(await pick()).toBe('commons');
  });

  it('counts a task assigned to you on someone else’s feature as your own work', async () => {
    // The pull-completion: t-89 made self-assign the verb for taking a commons
    // task. Without this arm, taking it would make `next_task` forget it while the
    // Board still showed it in your lane.
    findMany.mockResolvedValue([
      task({ id: 'commons', ownerUserId: 'someone-else' }),
      task({ id: 'pulled', ownerUserId: 'someone-else', assigneeUserId: USER }),
    ]);
    expect(await pick()).toBe('pulled');
  });

  it('counts a task you hold on someone else’s feature as your own work', async () => {
    findMany.mockResolvedValue([
      task({ id: 'commons', ownerUserId: 'someone-else' }),
      task({ id: 'held', ownerUserId: 'someone-else', claimedByUserId: USER }),
    ]);
    expect(await pick()).toBe('held');
  });

  it('does not let a commons bug interrupt your own ready work (bias is within a tier)', async () => {
    // The deliberate trade: the active-bugs strip already shows every open bug to
    // everyone, so a sweep is something you go and do — not something next_task
    // pushes at you mid-feature. Contrast with the next case.
    findMany.mockResolvedValue([
      task({ id: 'commons-bug', kind: 'bug', ownerUserId: 'someone-else' }),
      task({ id: 'mine' }),
    ]);
    expect(await pick()).toBe('mine');
  });

  it('still applies the bug bias inside the commons once that is the tier in play', async () => {
    findMany.mockResolvedValue([
      task({ id: 'commons-work', ownerUserId: 'someone-else' }),
      task({ id: 'commons-bug', kind: 'bug', ownerUserId: 'someone-else' }),
    ]);
    expect(await pick()).toBe('commons-bug');
  });

  it('still prefers a bug among your OWN work (§22-02 bias, unmoved)', async () => {
    findMany.mockResolvedValue([task({ id: 'mine-work' }), task({ id: 'mine-bug', kind: 'bug' })]);
    expect(await pick()).toBe('mine-bug');
  });

  it('an unowned, unheld task on a feature nobody owns is commons, not own work', async () => {
    // `ownerUserId: null` must not read as "matches nobody, therefore mine" — the
    // comparison is against the caller's id, never a nullish fallback. Needs a
    // second, genuinely-own task to discriminate: with `ownerless` alone the pick
    // is the same under either classification, so the assertion would hold even
    // with the `?? userId` bug it exists to catch.
    findMany.mockResolvedValue([
      task({ id: 'ownerless', ownerUserId: null }),
      task({ id: 'mine' }),
    ]);
    expect(await pick()).toBe('mine');
  });
});

describe('next_task readiness selection', () => {
  beforeEach(() => {
    accessibleProjectIds.mockResolvedValue(['p1']);
  });

  it('returns the first genuinely ready task, skipping blocked and already-in-progress', async () => {
    findMany.mockResolvedValue([
      task({ id: 'blocked', status: 'claimed', deps: ['active'] }), // dep unmerged → blocked
      task({ id: 'in-progress', status: 'active' }), // already being worked
      task({ id: 'ready', status: 'claimed', deps: ['merged'] }), // ready ✓
      task({ id: 'later', status: 'claimed' }),
    ]);

    const r = await cap.execute({}, ctx());
    expect(r.data?.task?.id).toBe('ready');
    expect(r.data?.consideredCount).toBe(4);
  });

  it('picks a claimed task regardless of its claimant (the claimant no longer gates readiness — f-status-model §20)', async () => {
    // Born-claimed tasks always carry a claimant (the feature owner); a task
    // being already "held" no longer excludes it from the recommendation.
    findMany.mockResolvedValue([
      task({ id: 'owned', status: 'claimed', claimedByUserId: 'someone', deps: ['merged'] }),
    ]);

    const r = await cap.execute({}, ctx());
    expect(r.data?.task?.id).toBe('owned');
  });

  it('returns null when nothing is ready', async () => {
    findMany.mockResolvedValue([task({ id: 'blocked', deps: ['claimed'] })]);
    const r = await cap.execute({}, ctx());
    expect(r.data).toEqual({ task: null, consideredCount: 1 });
  });

  it('prefers a ready bug over a ready feature-work task that sorts ahead of it (§22-02 bias)', async () => {
    findMany.mockResolvedValue([
      task({ id: 'work', status: 'claimed', deps: ['merged'] }), // ready feature-work, first
      task({ id: 'bug', status: 'claimed', kind: 'bug', deps: ['merged'] }), // ready bug, second
    ]);
    const r = await cap.execute({}, ctx());
    expect(r.data?.task?.id).toBe('bug');
  });

  it('never lets the bias override readiness: a blocked bug yields to a ready feature-work task', async () => {
    findMany.mockResolvedValue([
      task({ id: 'blocked-bug', status: 'claimed', kind: 'bug', deps: ['active'] }), // bug, but blocked
      task({ id: 'ready-work', status: 'claimed', deps: ['merged'] }), // the only pullable one
    ]);
    const r = await cap.execute({}, ctx());
    expect(r.data?.task?.id).toBe('ready-work');
  });

  it('shapes the recommended task with its t-N, feature slug, project id and file scope', async () => {
    findMany.mockResolvedValue([
      {
        ...task({ id: 'ready', deps: ['merged'], projectId: 'p9' }),
        filesScope: ['api/'],
        prUrl: null,
      },
    ]);
    const r = await cap.execute({}, ctx());
    expect(r.data?.task).toEqual({
      id: 'ready',
      number: 5, // the pick's t-N ref (t-66)
      title: 'task ready',
      featureId: 'feat-ready',
      featureSlug: 'f-ready', // + the feature slug, so the agent can name it
      projectId: 'p9',
      filesScope: ['api/'],
      prUrl: null,
    });
  });
});
