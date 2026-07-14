/**
 * Tests for `lib/projects/capabilities/next-task.ts`.
 *
 * next_task is membership-scoped and dependency-aware, so its matrix is the
 * load-bearing test: no-user guard, project scoping through the f-access funnel
 * (deny ≡ not_found), the owned-vs-help-wanted candidate set, and the pullable
 * filter (skips blocked/claimed, honours the null-claimant finding).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TaskStatus } from '@prisma/client';

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

/** A candidate task in the `select` shape next-task queries. */
function task(opts: {
  id: string;
  status?: TaskStatus;
  claimedByUserId?: string | null;
  deps?: TaskStatus[];
  projectId?: string;
}) {
  return {
    id: opts.id,
    title: `task ${opts.id}`,
    featureId: `feat-${opts.id}`,
    filesScope: [],
    prUrl: null,
    status: opts.status ?? 'available',
    claimedByUserId: opts.claimedByUserId ?? null,
    feature: { projectId: opts.projectId ?? 'proj-1' },
    dependencies: (opts.deps ?? []).map((status) => ({ dependsOn: { status } })),
  };
}

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
        where: { feature: { projectId: { in: ['p1', 'p2'] }, ownerUserId: USER } },
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
        where: { feature: { projectId: 'p1', ownerUserId: USER } },
      })
    );
  });

  it('widens the candidate set to help-wanted features when asked', async () => {
    accessibleProjectIds.mockResolvedValue(['p1']);
    findMany.mockResolvedValue([]);

    await cap.execute({ includeHelpWanted: true }, ctx());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          feature: { projectId: { in: ['p1'] }, OR: [{ ownerUserId: USER }, { helpWanted: true }] },
        },
      })
    );
  });
});

describe('next_task pullable selection', () => {
  beforeEach(() => {
    accessibleProjectIds.mockResolvedValue(['p1']);
  });

  it('returns the first genuinely pullable task, skipping blocked and claimed', async () => {
    findMany.mockResolvedValue([
      task({ id: 'blocked', status: 'available', deps: ['in_pr'] }), // dep unmerged → blocked
      task({ id: 'claimed', status: 'claimed', claimedByUserId: 'someone' }), // really claimed
      task({ id: 'ready', status: 'available', deps: ['merged'] }), // pullable ✓
      task({ id: 'later', status: 'available' }),
    ]);

    const r = await cap.execute({}, ctx());
    expect(r.data?.task?.id).toBe('ready');
    expect(r.data?.consideredCount).toBe(4);
  });

  it('treats a claimed-but-null-claimant task as pullable (erased-user finding)', async () => {
    findMany.mockResolvedValue([
      task({ id: 'orphan', status: 'claimed', claimedByUserId: null, deps: ['merged'] }),
    ]);

    const r = await cap.execute({}, ctx());
    expect(r.data?.task?.id).toBe('orphan');
  });

  it('returns null when nothing is pullable', async () => {
    findMany.mockResolvedValue([task({ id: 'blocked', deps: ['backlog'] })]);
    const r = await cap.execute({}, ctx());
    expect(r.data).toEqual({ task: null, consideredCount: 1 });
  });

  it('shapes the recommended task with its project id and file scope', async () => {
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
      title: 'task ready',
      featureId: 'feat-ready',
      projectId: 'p9',
      filesScope: ['api/'],
      prUrl: null,
    });
  });
});
