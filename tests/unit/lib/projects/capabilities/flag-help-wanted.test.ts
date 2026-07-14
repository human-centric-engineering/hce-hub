/**
 * Tests for `lib/projects/capabilities/flag-help-wanted.ts` — owner-scoped toggle.
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { feature: { update: vi.fn() } } }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { FlagHelpWantedCapability } = await import('@/lib/projects/capabilities/flag-help-wanted');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const featureUpdate = prisma.feature.update as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new FlagHelpWantedCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });
const grant = (helpWanted: boolean, basis = 'lead') => ({
  ok: true,
  feature: { projectId: 'p1', ownerUserId: USER, helpWanted, basis },
});

beforeEach(() => vi.clearAllMocks());

it('maps a member-without-owner-rights to forbidden', async () => {
  resolveFeature.mockResolvedValue({ ok: false, reason: 'forbidden' });
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());
  expect(r.error?.code).toBe('forbidden');
  expect(featureUpdate).not.toHaveBeenCalled();
});

it('maps a non-member/missing feature to not_found', async () => {
  resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());
  expect(r.error?.code).toBe('not_found');
  expect(featureUpdate).not.toHaveBeenCalled();
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
  expect(featureUpdate).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { helpWanted: true } });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'feature.help_wanted',
      changes: { helpWanted: { from: false, to: true } },
    })
  );
});

it('is a no-op (no write, no audit) when the flag is already at the requested value', async () => {
  resolveFeature.mockResolvedValue(grant(true));
  const r = await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());

  expect(r.data).toEqual({ featureId: 'f1', helpWanted: true });
  expect(featureUpdate).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
});

it('requires the owner access tier', async () => {
  resolveFeature.mockResolvedValue(grant(false));
  await cap.execute({ featureId: 'f1', helpWanted: true }, ctx());
  expect(resolveFeature).toHaveBeenCalledWith(USER, 'f1', 'owner');
});
