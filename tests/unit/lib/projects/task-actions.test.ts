/**
 * Tests for `lib/projects/task-actions.ts` — the shared Start/Complete core the
 * consumer routes run (f-status-model §20 t-1). Pins the funnel (deny →
 * NotFoundError, no write), the cross-project id-swap guard, the `claimed → active`
 * / `active → merged` transitions inside a tx (status + claim lifecycle + the
 * reused `task_claimed`/`task_merged` events, atomic), the merged no-op, and the
 * soft collision warnings on Start (never a block).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({
  resolveTaskAccess: vi.fn(),
  canAccessProject: vi.fn(),
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { taskClaim: { findMany: vi.fn() } } }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveTaskAccess, canAccessProject } = await import('@/lib/projects/access');
const { executeTransaction } = await import('@/lib/db/utils');
const { prisma } = await import('@/lib/db/client');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { NotFoundError, ValidationError } = await import('@/lib/api/errors');
const { startTask, completeTask, setTaskPr, assignTask } =
  await import('@/lib/projects/task-actions');

const resolveTask = resolveTaskAccess as ReturnType<typeof vi.fn>;
const canAccess = canAccessProject as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const findClaims = prisma.taskClaim.findMany as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const USER = 'user-1';

const granted = (
  overrides: Partial<{
    status: 'claimed' | 'active' | 'merged';
    claimedByUserId: string | null;
    filesScope: string[];
    projectId: string;
  }> = {}
) => ({
  ok: true,
  task: {
    taskId: 't1',
    featureId: 'f1',
    projectId: overrides.projectId ?? 'p1',
    status: overrides.status ?? 'claimed',
    claimedByUserId: overrides.claimedByUserId ?? USER,
    filesScope: overrides.filesScope ?? [],
    basis: 'member',
  },
});

const txClaimUpdateMany = vi.fn();
const txClaimCreate = vi.fn();
const txTaskUpdate = vi.fn();
function mockTx() {
  txClaimUpdateMany.mockResolvedValue({});
  txClaimCreate.mockResolvedValue({});
  txTaskUpdate.mockResolvedValue({});
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      taskClaim: { updateMany: txClaimUpdateMany, create: txClaimCreate },
      task: { update: txTaskUpdate },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx();
  findClaims.mockResolvedValue([]);
  canAccess.mockResolvedValue({ ok: true, basis: 'member' }); // assignee is a member by default
});

describe('startTask funnel', () => {
  it('throws NotFoundError for a non-member / unknown task (no write)', async () => {
    resolveTask.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(startTask(USER, 't1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the task is outside expectedProjectId (id-swap guard)', async () => {
    resolveTask.mockResolvedValue(granted({ projectId: 'other' }));
    await expect(startTask(USER, 't1', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('startTask write', () => {
  it('claimed → active: status flip, credits the doer, reused task_claimed event, opens a fresh claim', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'claimed', claimedByUserId: USER }));

    const r = await startTask(USER, 't1', 'p1');

    expect(r).toEqual({ taskId: 't1', status: 'active', warnings: [] });
    // Releases any prior open claim, then opens one for the caller.
    expect(txClaimUpdateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', releasedAt: null },
      data: { releasedAt: expect.any(Date) },
    });
    expect(txClaimCreate).toHaveBeenCalledWith({ data: { taskId: 't1', userId: USER } });
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'active', claimedByUserId: USER },
    });
    expect(emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: 't1', kind: 'task_claimed', actorUserId: USER })
    );
    // Atomicity: the event uses the same tx client that updated the task.
    expect(emit.mock.calls[0][0].task.update).toBe(txTaskUpdate);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.start', entityId: 't1' })
    );
  });

  it('soft-warns when the task is held by someone else, but still starts', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'claimed', claimedByUserId: 'someone-else' }));

    const r = await startTask(USER, 't1');

    expect(r.status).toBe('active');
    expect(r.warnings).toEqual([
      expect.objectContaining({ kind: 'already_claimed', userId: 'someone-else' }),
    ]);
    expect(txTaskUpdate).toHaveBeenCalled(); // proceeds regardless (never a block)
  });

  it('surfaces a file-overlap warning against another open claim', async () => {
    resolveTask.mockResolvedValue(
      granted({ status: 'claimed', claimedByUserId: USER, filesScope: ['lib/a.ts'] })
    );
    findClaims.mockResolvedValue([
      {
        userId: 'other',
        claimedAt: new Date('2026-07-20T00:00:00Z'),
        task: { id: 't2', title: 'Other work', filesScope: ['lib/a.ts'] },
      },
    ]);

    const r = await startTask(USER, 't1');

    expect(r.warnings).toEqual([expect.objectContaining({ kind: 'file_overlap', taskId: 't2' })]);
  });

  it('is a no-op on a merged task — no status change, no event', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'merged' }));

    const r = await startTask(USER, 't1');

    expect(r).toEqual({ taskId: 't1', status: 'merged', warnings: [] });
    expect(runTx).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('completeTask', () => {
  it('throws NotFoundError for a non-member / unknown task (no write)', async () => {
    resolveTask.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(completeTask(USER, 't1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('active → merged: status flip, closes the open claim, task_merged event', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'active' }));

    const r = await completeTask(USER, 't1', 'p1');

    expect(r).toEqual({ taskId: 't1', status: 'merged', warnings: [] });
    expect(txClaimUpdateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', releasedAt: null },
      data: { releasedAt: expect.any(Date) },
    });
    expect(txTaskUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'merged' } });
    expect(emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: 't1', kind: 'task_merged', actorUserId: USER })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.complete', entityId: 't1' })
    );
  });

  it('is lenient — completes straight from claimed', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'claimed' }));
    const r = await completeTask(USER, 't1');
    expect(r.status).toBe('merged');
    expect(txTaskUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'merged' } });
  });

  it('is a no-op on an already-merged task', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'merged' }));
    const r = await completeTask(USER, 't1');
    expect(r).toEqual({ taskId: 't1', status: 'merged', warnings: [] });
    expect(runTx).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('setTaskPr', () => {
  const PR = 'https://github.com/org/repo/pull/42';

  it('throws NotFoundError for a non-member / unknown task (no write)', async () => {
    resolveTask.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(setTaskPr(USER, 't1', PR)).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the task is outside expectedProjectId (id-swap guard)', async () => {
    resolveTask.mockResolvedValue(granted({ projectId: 'other' }));
    await expect(setTaskPr(USER, 't1', PR, 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('sets Task.prUrl + emits task_pr_linked, WITHOUT changing status', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'claimed' }));

    const r = await setTaskPr(USER, 't1', PR, 'p1');

    // Status is unchanged — linking a PR is not merging it.
    expect(r).toEqual({ taskId: 't1', status: 'claimed', warnings: [] });
    expect(txTaskUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { prUrl: PR } });
    // No status field in the update, and no claim lifecycle touched.
    expect(txTaskUpdate.mock.calls[0][0].data.status).toBeUndefined();
    expect(txClaimUpdateMany).not.toHaveBeenCalled();
    expect(txClaimCreate).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ taskId: 't1', kind: 'task_pr_linked', actorUserId: USER })
    );
    // Atomicity: the event uses the same tx client that updated the task.
    expect(emit.mock.calls[0][0].task.update).toBe(txTaskUpdate);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.set_pr', entityId: 't1' })
    );
  });

  it('preserves the task status for an active or merged task (link is orthogonal to lifecycle)', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'merged' }));
    const r = await setTaskPr(USER, 't1', PR);
    expect(r.status).toBe('merged');
    expect(txTaskUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { prUrl: PR } });
  });
});

describe('assignTask (f-task-assignment t1)', () => {
  const ASSIGNEE = 'user-2';

  it('throws NotFoundError for a non-member caller / unknown task (no write)', async () => {
    resolveTask.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(assignTask(USER, 't1', ASSIGNEE)).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the task is outside expectedProjectId (id-swap guard)', async () => {
    resolveTask.mockResolvedValue(granted({ projectId: 'other' }));
    await expect(assignTask(USER, 't1', ASSIGNEE, 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects an assignee who is not a member of the project (ValidationError, no write)', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'claimed' }));
    canAccess.mockResolvedValue({ ok: false, basis: null }); // assignee not a member
    await expect(assignTask(USER, 't1', 'stranger')).rejects.toBeInstanceOf(ValidationError);
    expect(canAccess).toHaveBeenCalledWith('stranger', 'p1');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('is a no-op for a merged task (credits the doer — never reassigns finished work)', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'merged' }));
    const r = await assignTask(USER, 't1', ASSIGNEE);
    expect(r).toEqual({ taskId: 't1', status: 'merged', warnings: [] });
    expect(canAccess).not.toHaveBeenCalled(); // short-circuits before validating the assignee
    expect(runTx).not.toHaveBeenCalled();
  });

  it('points a claimed task at the new assignee (assignee = claimant), no ProjectEvent', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'claimed', claimedByUserId: USER }));

    const r = await assignTask(USER, 't1', ASSIGNEE);

    expect(r).toEqual({ taskId: 't1', status: 'claimed', warnings: [] });
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { assigneeUserId: ASSIGNEE, claimedByUserId: ASSIGNEE, status: 'claimed' },
    });
    // Audit-logged, but no timeline event (t1 stays migration-free).
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.assign', entityId: 't1' })
    );
    expect(emit).not.toHaveBeenCalled();
  });

  it('reassigning an ACTIVE task resets it to claimed + releases the open claim (clean handoff)', async () => {
    resolveTask.mockResolvedValue(granted({ status: 'active', claimedByUserId: 'someone' }));

    const r = await assignTask(USER, 't1', ASSIGNEE);

    expect(r.status).toBe('claimed'); // reset from active
    // The prior active-work claim is released...
    expect(txClaimUpdateMany).toHaveBeenCalledWith({
      where: { taskId: 't1', releasedAt: null },
      data: { releasedAt: expect.any(Date) },
    });
    // ...and the task points at the new assignee, back in the claimed state.
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { assigneeUserId: ASSIGNEE, claimedByUserId: ASSIGNEE, status: 'claimed' },
    });
  });
});
