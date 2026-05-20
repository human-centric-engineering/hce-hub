/**
 * Tests for the execution reaper — marks zombie, stale pending, and abandoned executions as failed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reapZombieExecutions } from '@/lib/orchestration/engine/execution-reaper';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    aiWorkflowExecution: {
      // The reaper now does a `findMany` per category to collect ids
      // for the lease-event writes, in addition to the `updateMany`
      // that flips the rows. Default findMany to [] so the existing
      // updateMany-only tests continue to short-circuit.
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
    },
    aiWorkflowRunningStep: {
      deleteMany: vi.fn(),
    },
    aiWorkflowExecutionLeaseEvent: {
      create: vi.fn().mockResolvedValue({ id: 'evt-test' }),
    },
  },
}));

vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';

const mockUpdateMany = prisma.aiWorkflowExecution.updateMany as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.aiWorkflowExecution.findMany as ReturnType<typeof vi.fn>;
const mockRunningStepDeleteMany = prisma.aiWorkflowRunningStep.deleteMany as ReturnType<
  typeof vi.fn
>;
const mockLoggerWarn = logger.warn as unknown as ReturnType<typeof vi.fn>;

/**
 * Mock the three (findMany → updateMany) pairs the reaper now uses.
 * Each "count" maps to a row array of that length so the reaper's
 * inner length-check still triggers the updateMany call (it now
 * short-circuits to `{count: 0}` when findMany returns []).
 */
function mockCounts(running: number, pending: number, approvals: number) {
  const fakeRow = (i: number) => ({ id: `exec-${i}`, leaseToken: null });
  const runningRows = Array.from({ length: running }, (_, i) => fakeRow(i));
  const pendingRows = Array.from({ length: pending }, (_, i) => fakeRow(running + i));
  const approvalRows = Array.from({ length: approvals }, (_, i) => fakeRow(running + pending + i));
  mockFindMany
    .mockResolvedValueOnce(runningRows)
    .mockResolvedValueOnce(pendingRows)
    .mockResolvedValueOnce(approvalRows);
  if (running > 0) mockUpdateMany.mockResolvedValueOnce({ count: running });
  if (pending > 0) mockUpdateMany.mockResolvedValueOnce({ count: pending });
  if (approvals > 0) mockUpdateMany.mockResolvedValueOnce({ count: approvals });
}

describe('reapZombieExecutions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reaper always sweeps orphan running-step rows at the end of its tick.
    // Default to count=0 so existing tests that don't care can ignore it.
    mockRunningStepDeleteMany.mockResolvedValue({ count: 0 });
  });

  it('marks stale running executions as failed with errorMessage', async () => {
    mockCounts(3, 0, 0);

    const result = await reapZombieExecutions();

    expect(result.reaped).toBe(3);
    expect(result.stalePending).toBe(0);
    expect(result.abandonedApprovals).toBe(0);
    // The status/threshold filter now lives on `findMany` (which
    // collects the ids); `updateMany` then flips just those ids. We
    // assert both halves so a future change that drops either filter
    // surfaces here.
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'running',
          updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      })
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.objectContaining({ in: expect.any(Array) }) }),
        data: expect.objectContaining({
          status: 'failed',
          completedAt: expect.any(Date),
          errorMessage: expect.stringContaining('zombie threshold'),
        }),
      })
    );
  });

  it('marks stale pending executions as failed', async () => {
    mockCounts(0, 2, 0);

    const result = await reapZombieExecutions();

    expect(result.reaped).toBe(0);
    expect(result.stalePending).toBe(2);
    expect(result.abandonedApprovals).toBe(0);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'pending',
          createdAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      })
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.objectContaining({ in: expect.any(Array) }) }),
        data: expect.objectContaining({
          status: 'failed',
          completedAt: expect.any(Date),
          errorMessage: expect.stringContaining('did not reconnect'),
        }),
      })
    );
  });

  it('marks stale paused_for_approval executions as failed', async () => {
    mockCounts(0, 0, 2);

    const result = await reapZombieExecutions();

    expect(result.reaped).toBe(0);
    expect(result.stalePending).toBe(0);
    expect(result.abandonedApprovals).toBe(2);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'paused_for_approval',
          updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      })
    );
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.objectContaining({ in: expect.any(Array) }) }),
        data: expect.objectContaining({
          status: 'failed',
          completedAt: expect.any(Date),
          errorMessage: expect.stringContaining('approval not received'),
        }),
      })
    );
  });

  it('returns zero when nothing to reap', async () => {
    mockCounts(0, 0, 0);

    const result = await reapZombieExecutions();

    expect(result.reaped).toBe(0);
    expect(result.stalePending).toBe(0);
    expect(result.abandonedApprovals).toBe(0);
  });

  // Lease coherence — reaper must clear lease columns alongside the FAILED flip so a
  // reaper-killed RUNNING row can't be picked back up by claimLease (the orphan-sweep
  // race scenario from PR #167 code review).
  it('all three FAILED writes clear leaseToken and leaseExpiresAt to null', async () => {
    mockCounts(1, 1, 1);

    await reapZombieExecutions();

    expect(mockUpdateMany).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      const data = mockUpdateMany.mock.calls[i][0].data as Record<string, unknown>;
      expect(data['leaseToken']).toBeNull();
      expect(data['leaseExpiresAt']).toBeNull();
    }
  });

  it('accepts custom thresholds', async () => {
    mockCounts(1, 1, 1);

    const fiveMinutes = 5 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;
    await reapZombieExecutions(fiveMinutes, thirtyMinutes, oneDay);

    // The threshold cutoffs now live on `findMany` (the id-collection
    // pass), not `updateMany` (which targets ids by primary key).
    const runningCall = mockFindMany.mock.calls[0][0];
    const runningCutoff = runningCall.where.updatedAt.lt as Date;
    expect(Date.now() - runningCutoff.getTime()).toBeGreaterThan(fiveMinutes - 2000);
    expect(Date.now() - runningCutoff.getTime()).toBeLessThan(fiveMinutes + 2000);

    const pendingCall = mockFindMany.mock.calls[1][0];
    const pendingCutoff = pendingCall.where.createdAt.lt as Date;
    expect(Date.now() - pendingCutoff.getTime()).toBeGreaterThan(thirtyMinutes - 2000);
    expect(Date.now() - pendingCutoff.getTime()).toBeLessThan(thirtyMinutes + 2000);

    const approvalCall = mockFindMany.mock.calls[2][0];
    const approvalCutoff = approvalCall.where.updatedAt.lt as Date;
    expect(Date.now() - approvalCutoff.getTime()).toBeGreaterThan(oneDay - 2000);
    expect(Date.now() - approvalCutoff.getTime()).toBeLessThan(oneDay + 2000);
  });

  // ─── Running-step orphan sweep (one tick at the end of the reaper) ───────
  // The reaper's normal job is to flip stale executions to FAILED. Once
  // that's done, every running-step row whose parent execution is now in
  // a terminal status (completed/failed/cancelled) is stale by
  // definition — the engine's per-step delete and finalize sweep should
  // have caught them, but this is the self-healing fallback.

  it('always runs a single orphan-sweep deleteMany at the end of the tick', async () => {
    mockCounts(0, 0, 0);

    await reapZombieExecutions();

    // Even when no executions were reaped this tick, the sweep still
    // fires — orphans from prior incidents need cleaning up too.
    expect(mockRunningStepDeleteMany).toHaveBeenCalledTimes(1);
    const args = mockRunningStepDeleteMany.mock.calls[0][0];
    expect(args).toEqual({
      where: { execution: { status: { in: ['completed', 'failed', 'cancelled'] } } },
    });
  });

  it('logs the orphan-sweep count when > 0', async () => {
    mockCounts(0, 0, 0);
    mockRunningStepDeleteMany.mockResolvedValueOnce({ count: 4 });

    await reapZombieExecutions();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Reaped orphan running-step rows',
      expect.objectContaining({ count: 4 })
    );
  });

  it('does not log the orphan-sweep when count = 0', async () => {
    mockCounts(0, 0, 0);
    mockRunningStepDeleteMany.mockResolvedValueOnce({ count: 0 });

    await reapZombieExecutions();

    const orphanWarns = mockLoggerWarn.mock.calls.filter(([msg]) =>
      String(msg).includes('orphan running-step')
    );
    expect(orphanWarns).toHaveLength(0);
  });
});
