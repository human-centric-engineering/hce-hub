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
    basis: 'member',
  },
};

const txFeatureUpdate = vi.fn();
function mockTx() {
  txFeatureUpdate.mockResolvedValue({});
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ feature: { update: txFeatureUpdate } })
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
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { status: 'shipped' },
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

  it('soft-warns on unmerged tasks but still ships', async () => {
    taskCount.mockResolvedValue(3);

    const r = await cap.execute({ featureId: 'f1', summary: 'ship anyway' }, ctx());

    expect(r.data?.shipped).toBe(true);
    expect(r.data?.warnings).toEqual([
      expect.objectContaining({ kind: 'unmerged_tasks', count: 3 }),
    ]);
    // Never blocks — the status flip happened.
    expect(txFeatureUpdate).toHaveBeenCalled();
    expect(taskCount).toHaveBeenCalledWith({
      where: { featureId: 'f1', status: { not: 'merged' } },
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
