/**
 * Tests for `lib/projects/capabilities/add-backlog.ts` — any-member backlog capture.
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { AddBacklogCapability } = await import('@/lib/projects/capabilities/add-backlog');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new AddBacklogCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

const txTaskCreate = vi.fn();
const txProjectUpdate = vi.fn();
function mockTxCreatesTask(id = 't-b', status = 'backlog', nextNumber = 4) {
  txTaskCreate.mockResolvedValue({ id, status });
  txProjectUpdate.mockResolvedValue({ taskCounter: nextNumber });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ project: { update: txProjectUpdate }, task: { create: txTaskCreate } })
  );
}

const granted = {
  ok: true,
  feature: { projectId: 'p1', ownerUserId: 'other', helpWanted: false, basis: 'member' },
};

beforeEach(() => vi.clearAllMocks());

it('errors no_user_context for a null-user run', async () => {
  const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx(null));
  expect(r.error?.code).toBe('no_user_context');
});

it('maps a non-member/missing feature to not_found', async () => {
  resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
  const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx());
  expect(r.error?.code).toBe('not_found');
  expect(runTx).not.toHaveBeenCalled();
});

it('creates a backlog task (any member) with the next project number and audits', async () => {
  resolveFeature.mockResolvedValue(granted);
  mockTxCreatesTask('t-b', 'backlog', 4);

  const r = await cap.execute({ featureId: 'f1', title: 'idea' }, ctx());

  expect(r.data).toEqual({ taskId: 't-b', status: 'backlog', featureId: 'f1' });
  // Atomic counter bump on the feature's project + stamp the number.
  expect(txProjectUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'p1' }, data: { taskCounter: { increment: 1 } } })
  );
  expect(txTaskCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { featureId: 'f1', number: 4, title: 'idea', status: 'backlog' },
    })
  );
  expect(audit).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'task.add_backlog', entityId: 't-b', userId: USER })
  );
});

it('uses the member (not owner) access tier', async () => {
  resolveFeature.mockResolvedValue(granted);
  mockTxCreatesTask();
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
