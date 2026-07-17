/**
 * Tests for `lib/projects/capabilities/claim-task.ts`.
 *
 * Pins the soft-collision behaviour: claiming always succeeds (never blocks),
 * surfaces an already-claimed warning (but NOT for a null/erased claimant or
 * self), surfaces file-overlap warnings from other open claims, and writes the
 * release→claim→status handoff transactionally.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveTaskAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { taskClaim: { findMany: vi.fn() } } }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
// The capability runs the real claimTask service; its journal write is covered
// in claim-task-service.test.ts, so stub it here to keep this matrix on
// collisions/handoff.
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveTaskAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { ClaimTaskCapability } = await import('@/lib/projects/capabilities/claim-task');

const resolveTask = resolveTaskAccess as ReturnType<typeof vi.fn>;
const claimFindMany = prisma.taskClaim.findMany as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new ClaimTaskCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

function grantTask(
  overrides: Partial<{ claimedByUserId: string | null; filesScope: string[] }> = {}
) {
  resolveTask.mockResolvedValue({
    ok: true,
    task: {
      taskId: 't1',
      featureId: 'f1',
      projectId: 'p1',
      status: 'available',
      claimedByUserId: overrides.claimedByUserId ?? null,
      filesScope: overrides.filesScope ?? [],
      basis: 'member',
    },
  });
}

const txUpdateMany = vi.fn();
const txCreate = vi.fn();
const txTaskUpdate = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  claimFindMany.mockResolvedValue([]); // no other open claims by default
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      taskClaim: { updateMany: txUpdateMany, create: txCreate },
      task: { update: txTaskUpdate },
    })
  );
});

describe('claim_task guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ taskId: 't1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(resolveTask).not.toHaveBeenCalled();
  });

  it('maps a non-member/missing task to not_found', async () => {
    resolveTask.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('claim_task write (the handoff)', () => {
  it('releases prior open claims, opens a fresh claim, points the task at the caller', async () => {
    grantTask();
    const r = await cap.execute({ taskId: 't1' }, ctx());

    expect(r.data).toMatchObject({ taskId: 't1', claimed: true, warnings: [] });
    expect(txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ taskId: 't1', releasedAt: null }),
      })
    );
    expect(txCreate).toHaveBeenCalledWith({ data: { taskId: 't1', userId: USER } });
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'claimed', claimedByUserId: USER },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.claim', entityId: 't1' })
    );
  });
});

describe('claim_task soft collisions (never a block)', () => {
  it('warns when the task is already claimed by another live claimant', async () => {
    grantTask({ claimedByUserId: 'someone-else' });
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.data?.claimed).toBe(true); // still claims
    expect(r.data?.warnings).toEqual([
      expect.objectContaining({ kind: 'already_claimed', userId: 'someone-else' }),
    ]);
  });

  it('does NOT warn when the stored claimant is null (erased user) — treated as unclaimed', async () => {
    grantTask({ claimedByUserId: null });
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.data?.warnings).toEqual([]);
  });

  it('does NOT warn when the caller already holds it', async () => {
    grantTask({ claimedByUserId: USER });
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.data?.warnings).toEqual([]);
  });

  it('warns on file overlap with another open claim in the project', async () => {
    grantTask({ filesScope: ['api/auth.ts'] });
    claimFindMany.mockResolvedValue([
      {
        userId: 'u2',
        claimedAt: new Date('2026-07-14T00:00:00Z'),
        task: { id: 't9', title: 'Auth work', filesScope: ['api/'] },
      },
    ]);
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.data?.warnings).toEqual([
      expect.objectContaining({ kind: 'file_overlap', taskId: 't9', userId: 'u2' }),
    ]);
    // The collision query is scoped to the project and excludes self + this task.
    expect(claimFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          releasedAt: null,
          userId: { not: USER },
          taskId: { not: 't1' },
          task: { feature: { projectId: 'p1' } },
        }),
      })
    );
  });
  it('errors (no_user_context) without a signed-in caller', async () => {
    const r = await cap.execute({ taskId: 't1' }, ctx(null));
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('no_user_context');
  });

  it('propagates a non-not-found error from the claim core', async () => {
    grantTask();
    runTx.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ taskId: 't1' }, ctx())).rejects.toThrow('db down');
  });
});
