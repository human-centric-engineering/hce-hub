/**
 * Tests for `lib/projects/capabilities/claim-feature.ts` — the member-tier,
 * pull-not-push ownership move. Pins the funnel (deny ≡ not_found), the
 * owner+in_flight update, the feature_claimed event, and the soft already_owned
 * warning (which never blocks the claim).
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
const { ClaimFeatureCapability } = await import('@/lib/projects/capabilities/claim-feature');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const cap = new ClaimFeatureCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

const granted = (ownerUserId: string | null) => ({
  ok: true,
  feature: {
    projectId: 'p1',
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

describe('claim_feature guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ featureId: 'f1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(resolveFeature).not.toHaveBeenCalled();
  });

  it('maps a non-member/missing feature to not_found', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ featureId: 'f1' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('claim_feature happy path', () => {
  it('claims an unowned feature: owner=caller, in_flight, feature_claimed, no warning', async () => {
    resolveFeature.mockResolvedValue(granted(null));

    const r = await cap.execute({ featureId: 'f1' }, ctx());

    expect(r).toEqual({
      success: true,
      data: { featureId: 'f1', claimed: true, warnings: [] },
    });
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

    const r = await cap.execute({ featureId: 'f1' }, ctx());

    expect(r.data?.claimed).toBe(true);
    expect(r.data?.warnings).toEqual([
      expect.objectContaining({ kind: 'already_owned', ownerUserId: 'someone-else' }),
    ]);
    // The claim proceeds regardless — ownership is a signal, not a lock.
    expect(txFeatureUpdate).toHaveBeenCalled();
  });

  it('does not warn when the caller already owns it', async () => {
    resolveFeature.mockResolvedValue(granted(USER));
    const r = await cap.execute({ featureId: 'f1' }, ctx());
    expect(r.data?.warnings).toEqual([]);
  });
});
