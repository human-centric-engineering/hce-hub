/**
 * Tests for `lib/projects/claim-feature-service.ts` — the shared claim-a-feature
 * core the capability + the consumer route both run. Pins the funnel (deny →
 * NotFoundError), the cross-project id-swap guard (expectedProjectId), the
 * owner+in_flight update inside a tx, the feature_claimed event (atomic), and the
 * soft already_owned warning (never a block).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { NotFoundError } = await import('@/lib/api/errors');
const { claimFeature } = await import('@/lib/projects/claim-feature-service');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const USER = 'user-1';

const granted = (ownerUserId: string | null, projectId = 'p1') => ({
  ok: true,
  feature: {
    projectId,
    ownerUserId,
    status: 'planning',
    planningStage: 'indicative',
    helpWanted: false,
    basis: 'member',
  },
});

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

describe('claimFeature funnel', () => {
  it('throws NotFoundError for a non-member / unknown feature (no write)', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(claimFeature(USER, 'f1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the feature is outside expectedProjectId (id-swap guard)', async () => {
    resolveFeature.mockResolvedValue(granted(null, 'other-project'));
    await expect(claimFeature(USER, 'f1', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('allows the claim when expectedProjectId matches', async () => {
    resolveFeature.mockResolvedValue(granted(null, 'p1'));
    const r = await claimFeature(USER, 'f1', 'p1');
    expect(r.claimed).toBe(true);
  });
});

describe('claimFeature write', () => {
  it('claims an unowned feature: owner=caller, in_flight, feature_claimed, no warning', async () => {
    resolveFeature.mockResolvedValue(granted(null));

    const r = await claimFeature(USER, 'f1');

    expect(r).toEqual({ featureId: 'f1', claimed: true, warnings: [] });
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { ownerUserId: USER, status: 'in_flight' },
    });
    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f1',
      kind: 'feature_claimed',
      actorUserId: USER,
      metadata: { previousOwner: null },
    });
    // Atomicity: the event uses the same tx client that updated the feature.
    expect(emit.mock.calls[0][0].feature.update).toBe(txFeatureUpdate);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'feature.claim', entityId: 'f1' })
    );
  });

  it('soft-warns when already owned by someone else, but still claims', async () => {
    resolveFeature.mockResolvedValue(granted('someone-else'));

    const r = await claimFeature(USER, 'f1');

    expect(r.claimed).toBe(true);
    expect(r.warnings).toEqual([
      expect.objectContaining({ kind: 'already_owned', ownerUserId: 'someone-else' }),
    ]);
    expect(txFeatureUpdate).toHaveBeenCalled(); // proceeds regardless
  });

  it('does not warn when the caller already owns it', async () => {
    resolveFeature.mockResolvedValue(granted(USER));
    const r = await claimFeature(USER, 'f1');
    expect(r.warnings).toEqual([]);
  });
});
