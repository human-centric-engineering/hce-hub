/**
 * Tests for `lib/projects/capabilities/flag-help-wanted.ts` — owner-scoped toggle.
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { FlagHelpWantedCapability } = await import('@/lib/projects/capabilities/flag-help-wanted');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const cap = new FlagHelpWantedCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });
const grant = (helpWanted: boolean, basis = 'lead') => ({
  ok: true,
  feature: { projectId: 'p1', ownerUserId: USER, helpWanted, basis },
});

// The update + the journal event share one transaction; run the capability's
// real callback against a fake tx so both writes can be asserted.
const txFeatureUpdate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ feature: { update: txFeatureUpdate } })
  );
});

it('maps a member-without-owner-rights to forbidden', async () => {
  resolveFeature.mockResolvedValue({ ok: false, reason: 'forbidden' });
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());
  expect(r.error?.code).toBe('forbidden');
  expect(runTx).not.toHaveBeenCalled();
});

it('maps a non-member/missing feature to not_found', async () => {
  resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());
  expect(r.error?.code).toBe('not_found');
  expect(runTx).not.toHaveBeenCalled();
});

it('errors no_user_context for a null-user run', async () => {
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx(null));
  expect(r.error?.code).toBe('no_user_context');
  expect(resolveFeature).not.toHaveBeenCalled();
});

it('sets the flag and audits the change with from/to', async () => {
  resolveFeature.mockResolvedValue(grant(false));
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());

  expect(r.data).toEqual({ featureId: 'f1', helpWanted: true });
  expect(txFeatureUpdate).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { helpWanted: true } });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'feature.help_wanted',
      changes: { helpWanted: { from: false, to: true } },
    })
  );
});

it('journals a help_wanted event inside the same transaction on change', async () => {
  resolveFeature.mockResolvedValue(grant(false));
  await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());

  expect(emit).toHaveBeenCalledWith(expect.anything(), {
    projectId: 'p1',
    featureId: 'f1',
    kind: 'help_wanted',
    actorUserId: USER,
    metadata: { helpWanted: true },
  });
  // Atomicity: written with the transaction client that carries the update.
  expect(emit.mock.calls[0][0].feature.update).toBe(txFeatureUpdate);
});

it('is a no-op (no tx, no event, no audit) when the flag is already at the requested value', async () => {
  resolveFeature.mockResolvedValue(grant(true));
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());

  expect(r.data).toEqual({ featureId: 'f1', helpWanted: true });
  expect(runTx).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

it('requires the owner access tier', async () => {
  resolveFeature.mockResolvedValue(grant(false));
  await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());
  expect(resolveFeature).toHaveBeenCalledWith(USER, 'f1', 'owner');
});
