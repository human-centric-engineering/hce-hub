/**
 * Tests for `lib/projects/capabilities/add-backlog.ts` — any-member backlog capture.
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { task: { create: vi.fn() } } }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { AddBacklogCapability } = await import('@/lib/projects/capabilities/add-backlog');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const taskCreate = prisma.task.create as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new AddBacklogCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

it('errors no_user_context for a null-user run', async () => {
  const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx(null));
  expect(r.error?.code).toBe('no_user_context');
});

it('maps a non-member/missing feature to not_found', async () => {
  resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
  const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx());
  expect(r.error?.code).toBe('not_found');
  expect(taskCreate).not.toHaveBeenCalled();
});

it('creates a backlog task (any member) and audits', async () => {
  resolveFeature.mockResolvedValue({
    ok: true,
    feature: { projectId: 'p1', ownerUserId: 'other', helpWanted: false, basis: 'member' },
  });
  taskCreate.mockResolvedValue({ id: 't-b', status: 'backlog' });

  const r = await cap.execute({ featureId: 'f1', title: 'idea' }, ctx());

  expect(r.data).toEqual({ taskId: 't-b', status: 'backlog', featureId: 'f1' });
  expect(taskCreate).toHaveBeenCalledWith({
    data: { featureId: 'f1', title: 'idea', status: 'backlog' },
    select: { id: true, status: true },
  });
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'task.add_backlog', entityId: 't-b', userId: USER })
  );
});

it('uses the member (not owner) access tier', async () => {
  resolveFeature.mockResolvedValue({
    ok: true,
    feature: { projectId: 'p1', ownerUserId: 'other', helpWanted: false, basis: 'member' },
  });
  taskCreate.mockResolvedValue({ id: 't', status: 'backlog' });
  await cap.execute({ featureId: 'f1', title: 'idea' }, ctx());
  expect(resolveFeature).toHaveBeenCalledWith(USER, 'f1', 'member');
});

it('redacts the free-text title on the provenance row', () => {
  const out = cap.redactProvenance(
    { featureId: 'f1', title: 'private thought' },
    { success: true, data: { taskId: 't', status: 'backlog', featureId: 'f1' } }
  );
  expect((out.args as { title: string }).title).not.toContain('private thought');
});
