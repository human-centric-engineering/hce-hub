/**
 * Tests for `lib/projects/capabilities/ship-feature.ts` — the owner-tier close-out.
 * Pins the funnel (not_found / forbidden), the status→shipped flip with the
 * summary as the feature_shipped event body, and the unmerged-tasks SOFT warning
 * (status still flips — done is human-judged, §5). Summary is redacted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { task: { count: vi.fn() } } }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { ShipFeatureCapability } = await import('@/lib/projects/capabilities/ship-feature');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const taskCount = prisma.task.count as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const cap = new ShipFeatureCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });
const granted = {
  ok: true,
  feature: {
    projectId: 'p1',
    ownerUserId: USER,
    status: 'in_flight',
    planningStage: 'planned',
    helpWanted: false,
    shippedAt: null,
    basis: 'member',
  },
};

const txFeatureUpdate = vi.fn();
const txFeatureUpdateMany = vi.fn();
function mockTx() {
  txFeatureUpdate.mockResolvedValue({});
  txFeatureUpdateMany.mockResolvedValue({ count: 1 });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ feature: { update: txFeatureUpdate, updateMany: txFeatureUpdateMany } })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx();
});

describe('ship_feature guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ featureId: 'f1', summary: 's' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
  });

  it('maps a non-member/missing feature to not_found', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ featureId: 'f1', summary: 's' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('maps a member-without-owner-rights to forbidden', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const r = await cap.execute({ featureId: 'f1', summary: 's' }, ctx());
    expect(r.error?.code).toBe('forbidden');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('ship_feature close-out', () => {
  beforeEach(() => resolveFeature.mockResolvedValue(granted));

  it('flips to shipped with the summary as the event body, no warning when all merged', async () => {
    taskCount.mockResolvedValue(0);

    const r = await cap.execute({ featureId: 'f1', summary: 'Shipped the journal.' }, ctx());

    expect(r).toEqual({
      success: true,
      data: { featureId: 'f1', shipped: true, warnings: [] },
    });
    // `shippedAt` is stamped in the SAME TRANSACTION as the status flip
    // (f-work-kinds §32 t-79) — a shipped feature without a boundary would
    // silently keep counting every future task toward its completion.
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { status: 'shipped' },
    });
    expect(txFeatureUpdateMany).toHaveBeenCalledWith({
      where: { id: 'f1', shippedAt: null },
      data: { shippedAt: expect.any(Date) },
    });
    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f1',
      kind: 'feature_shipped',
      actorUserId: USER,
      body: 'Shipped the journal.',
      metadata: { unmergedCount: 0 },
    });
    expect(emit.mock.calls[0][0].feature.update).toBe(txFeatureUpdate);
  });

  it('keeps the ORIGINAL shippedAt when an already-shipped feature is re-shipped', async () => {
    // ship_feature is idempotent and re-runnable — a corrected narrative, or an
    // agent retrying after an MCP timeout. Re-stamping would move the boundary
    // forward and pull work raised since the real ship back inside it, denting the
    // bar this feature exists to protect. First ship wins, matching the backfill's
    // MIN(createdAt).
    //
    // "First wins" is enforced by the SQL predicate, NOT by a `??` on the
    // pre-transaction read — so the assertion is that the stamp is GUARDED, not
    // that it re-sends the old value. The guard is what makes two OVERLAPPING
    // ships safe; the `??` only ever handled the sequential case.
    const firstShip = new Date('2026-08-01T12:00:00Z');
    resolveFeature.mockResolvedValue({
      ...granted,
      feature: { ...granted.feature, status: 'shipped', shippedAt: firstShip },
    });
    taskCount.mockResolvedValue(0);

    await cap.execute({ featureId: 'f1', summary: 'corrected narrative' }, ctx());

    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { status: 'shipped' },
    });
    expect(txFeatureUpdateMany).toHaveBeenCalledWith({
      where: { id: 'f1', shippedAt: null },
      data: { shippedAt: expect.any(Date) },
    });
    // No separate "must not ride on the unguarded update" assertion here: the
    // `toHaveBeenCalledWith` above is a STRICT deep match, so a stray `shippedAt`
    // on that call already fails it. (Its sibling in `task-actions.test.ts` does
    // need one — that assertion is an `objectContaining`, so it matches partially.)
  });

  it('stamps a shipped feature whose boundary the backfill could not resolve', async () => {
    // A null was counting every task already, so stamping can only ever reduce the
    // count — safe, and it repairs a row the migration's journal lookup missed.
    resolveFeature.mockResolvedValue({
      ...granted,
      feature: { ...granted.feature, status: 'shipped', shippedAt: null },
    });
    taskCount.mockResolvedValue(0);

    await cap.execute({ featureId: 'f1', summary: 'repair' }, ctx());

    // The same guarded write repairs it: `shippedAt: null` matches, so it stamps.
    expect(txFeatureUpdateMany).toHaveBeenCalledWith({
      where: { id: 'f1', shippedAt: null },
      data: { shippedAt: expect.any(Date) },
    });
  });

  it('soft-warns on unmerged tasks but still ships', async () => {
    taskCount.mockResolvedValue(3);

    const r = await cap.execute({ featureId: 'f1', summary: 'ship anyway' }, ctx());

    expect(r.data?.shipped).toBe(true);
    expect(r.data?.warnings).toEqual([
      expect.objectContaining({ kind: 'unmerged_tasks', count: 3 }),
    ]);
    // Never blocks — the status flip happened.
    expect(txFeatureUpdate).toHaveBeenCalled();
    // Counts only unmerged completion-relevant work — bugs are off the completion
    // axis (f-bug-handling §22-02), so the warning agrees with the Plan's progress.
    //
    // `enhancement` is NOT excluded (f-work-kinds §32 t-79): the ship boundary
    // isn't stamped until the transaction below, so every task that exists at this
    // moment still counts as build-out in `computeFeatureProgress`. Excluding it
    // here would make the warning contradict the bar it mirrors — the exact
    // disagreement this assertion exists to prevent.
    expect(taskCount).toHaveBeenCalledWith({
      where: { featureId: 'f1', status: { not: 'merged' }, kind: { not: 'bug' } },
    });
  });
});

describe('ship_feature redactProvenance', () => {
  it('masks the free-text summary, keeps the feature id', () => {
    const out = cap.redactProvenance(
      { featureId: 'f1', summary: 'secret narrative' },
      { success: true, data: { featureId: 'f1', shipped: true, warnings: [] } }
    );
    const a = out.args as Record<string, unknown>;
    expect(a.featureId).toBe('f1');
    expect(String(a.summary)).not.toContain('secret narrative');
  });
});
