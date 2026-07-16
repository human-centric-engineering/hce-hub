/**
 * Unit: `claimTask` service (f-task-sheet §11 t-3).
 *
 * The claim core shared by the capability + the consumer route. The full
 * soft-collision behaviour is pinned in the capability test; here we cover the
 * service's own contract: the funnel 404 throw, the `expectedProjectId`
 * cross-project guard, and the release→claim→status transaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveTaskAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { taskClaim: { findMany: vi.fn() } } }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveTaskAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { NotFoundError } = await import('@/lib/api/errors');
const { claimTask } = await import('@/lib/projects/claim-task-service');

const resolveTask = resolveTaskAccess as ReturnType<typeof vi.fn>;
const claimFindMany = prisma.taskClaim.findMany as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;

const txUpdateMany = vi.fn();
const txCreate = vi.fn();
const txTaskUpdate = vi.fn();

function grantTask(over: Partial<{ claimedByUserId: string | null; filesScope: string[] }> = {}) {
  resolveTask.mockResolvedValue({
    ok: true,
    task: {
      taskId: 't1',
      projectId: 'p1',
      status: 'available',
      claimedByUserId: over.claimedByUserId ?? null,
      filesScope: over.filesScope ?? [],
      basis: 'member',
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  claimFindMany.mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      taskClaim: { updateMany: txUpdateMany, create: txCreate },
      task: { update: txTaskUpdate },
    })
  );
});

describe('claimTask', () => {
  it('claims a clean task (no warnings) and writes the release→claim→status handoff', async () => {
    grantTask();
    const result = await claimTask('user-1', 't1');
    expect(result).toEqual({ taskId: 't1', claimed: true, warnings: [] });
    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', releasedAt: null },
      data: { releasedAt: expect.any(Date) },
    });
    expect(txCreate).toHaveBeenCalledWith({ data: { taskId: 't1', userId: 'user-1' } });
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'claimed', claimedByUserId: 'user-1' },
    });
  });

  it('surfaces an already-claimed soft warning (still claims — never a lock)', async () => {
    grantTask({ claimedByUserId: 'someone-else' });
    const result = await claimTask('user-1', 't1');
    expect(result.claimed).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].kind).toBe('already_claimed');
  });

  it('throws NotFoundError for a non-member / unknown task (→ 404)', async () => {
    resolveTask.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(claimTask('user-1', 't1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the task is outside expectedProjectId (cross-project id-swap)', async () => {
    grantTask(); // task.projectId = 'p1'
    await expect(claimTask('user-1', 't1', 'other-project')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('claims when expectedProjectId matches the task project', async () => {
    grantTask(); // task.projectId = 'p1'
    const result = await claimTask('user-1', 't1', 'p1');
    expect(result.claimed).toBe(true);
  });
});
