/**
 * Tests for `lib/projects/capabilities/update-task.ts` (f-authoring-fidelity §21
 * t-b). An owner-tier edit verb, so the matrix pins: the no-user guard, the
 * nothing_to_update guard, the funnel (missing task → not_found; non-member →
 * not_found; member-non-owner → forbidden), the partial-patch semantics
 * (undefined = untouched, null = clear, filesScope via `{ set }`), the audit
 * write, and free-text provenance redaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { task: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { UpdateTaskCapability } = await import('@/lib/projects/capabilities/update-task');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const taskFindUnique = prisma.task.findUnique as ReturnType<typeof vi.fn>;
const taskUpdate = prisma.task.update as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new UpdateTaskCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });
const grantedOwner = { ok: true, feature: { projectId: 'p1', ownerUserId: USER, basis: 'member' } };

beforeEach(() => {
  vi.clearAllMocks();
  taskFindUnique.mockResolvedValue({ id: 't1', featureId: 'f1' });
  taskUpdate.mockResolvedValue({ id: 't1' });
  resolveFeature.mockResolvedValue(grantedOwner);
});

describe('update_task guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ taskId: 't1', title: 'x' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(taskFindUnique).not.toHaveBeenCalled();
  });

  it('errors nothing_to_update when no editable field is supplied (before any DB hit)', async () => {
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.error?.code).toBe('nothing_to_update');
    expect(taskFindUnique).not.toHaveBeenCalled();
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it('maps a missing task to not_found (no update)', async () => {
    taskFindUnique.mockResolvedValue(null);
    const r = await cap.execute({ taskId: 't1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(resolveFeature).not.toHaveBeenCalled();
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it('maps a non-member (funnel not_found) to not_found — no enumeration', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ taskId: 't1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it('maps a member-without-owner-rights to forbidden', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const r = await cap.execute({ taskId: 't1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('forbidden');
    expect(taskUpdate).not.toHaveBeenCalled();
  });
});

describe('update_task patch semantics', () => {
  it('updates only the supplied fields and reports them (undefined = untouched)', async () => {
    const r = await cap.execute({ taskId: 't1', title: 'New title', doneWhen: 'it works' }, ctx());
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ taskId: 't1', updated: ['title', 'doneWhen'] });
    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { title: 'New title', doneWhen: 'it works' },
    });
    // The task is scoped by its feature at the owner tier.
    expect(resolveFeature).toHaveBeenCalledWith(USER, 'f1', 'owner');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'task.update',
        entityId: 't1',
        metadata: { fields: ['title', 'doneWhen'] },
      })
    );
  });

  it('clears description / doneWhen when passed null', async () => {
    const r = await cap.execute({ taskId: 't1', description: null, doneWhen: null }, ctx());
    expect(r.data?.updated).toEqual(['description', 'doneWhen']);
    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { description: null, doneWhen: null },
    });
  });

  it('replaces filesScope via a `set` (scalar-list update)', async () => {
    await cap.execute({ taskId: 't1', filesScope: ['lib/a.ts', 'lib/b.ts'] }, ctx());
    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { filesScope: { set: ['lib/a.ts', 'lib/b.ts'] } },
    });
  });
});

describe('update_task redactProvenance', () => {
  it('masks the supplied free-text fields, preserves undefined + the id', () => {
    const out = cap.redactProvenance(
      { taskId: 't1', title: 'secret title', description: 'secret body' },
      { success: true, data: { taskId: 't1', updated: ['title', 'description'] } }
    );
    const a = out.args as {
      taskId: string;
      title: string;
      description: string;
      doneWhen: unknown;
    };
    expect(a.taskId).toBe('t1');
    expect(a.title).not.toContain('secret title');
    expect(a.description).not.toContain('secret body');
    expect(a.doneWhen).toBeUndefined(); // untouched → preserved as undefined
  });

  it('preserves an explicit null (clear) through redaction', () => {
    const out = cap.redactProvenance(
      { taskId: 't1', description: null },
      { success: true, data: { taskId: 't1', updated: ['description'] } }
    );
    expect((out.args as { description: unknown }).description).toBeNull();
  });
});
