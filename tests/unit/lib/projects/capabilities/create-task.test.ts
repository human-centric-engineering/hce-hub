/**
 * Tests for `lib/projects/capabilities/create-task.ts`.
 *
 * A write capability, so its matrix pins the authz funnel (owner-tier via
 * resolveFeatureAccess — deny ≡ not_found), dependency-integrity validation
 * (deps must exist in the same project), the transactional create, the audit
 * write, and free-text provenance redaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { task: { findMany: vi.fn() } },
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { CreateTaskCapability } = await import('@/lib/projects/capabilities/create-task');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const cap = new CreateTaskCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });
const granted = {
  ok: true,
  feature: { projectId: 'p1', ownerUserId: USER, helpWanted: false, basis: 'lead' },
};

// tx create returns a fresh task; capture the project counter bump, the task
// create, and the dependency createMany.
const txDepCreateMany = vi.fn();
const txTaskCreate = vi.fn();
const txProjectUpdate = vi.fn();
function mockTxCreatesTask(id = 't-new', status = 'available', nextNumber = 7) {
  txTaskCreate.mockResolvedValue({ id, status });
  txProjectUpdate.mockResolvedValue({ taskCounter: nextNumber });
  // The mock runs the capability's real tx callback so we can assert what it
  // wrote; the untyped vi.fn() infers a void-returning impl, hence the disable.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      project: { update: txProjectUpdate },
      task: { create: txTaskCreate },
      taskDependency: { createMany: txDepCreateMany },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('create_task guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(resolveFeature).not.toHaveBeenCalled();
  });

  it('maps a non-member/missing feature to not_found', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('maps a member-without-owner-rights to forbidden', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('forbidden');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('create_task dependency integrity', () => {
  beforeEach(() => resolveFeature.mockResolvedValue(granted));

  it('rejects deps that are not all present in the same project', async () => {
    taskFindMany.mockResolvedValue([{ id: 'd1' }]); // only 1 of 2 found
    const r = await cap.execute(
      { featureId: 'f1', title: 'x', dependsOnTaskIds: ['d1', 'd2'] },
      ctx()
    );
    expect(r.error?.code).toBe('invalid_dependency');
    expect(runTx).not.toHaveBeenCalled();
    // Scoped to the feature's project.
    expect(taskFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['d1', 'd2'] }, feature: { projectId: 'p1' } },
      select: { id: true },
    });
  });

  it('creates the task and its dependency edges when deps are valid', async () => {
    taskFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    mockTxCreatesTask('t-new', 'available');

    const r = await cap.execute(
      { featureId: 'f1', title: 'Wire auth', dependsOnTaskIds: ['d1', 'd2', 'd1'] },
      ctx()
    );

    expect(r).toEqual({
      success: true,
      data: { taskId: 't-new', status: 'available', featureId: 'f1' },
    });
    // De-duplicated edges from the new task to each dep.
    expect(txDepCreateMany).toHaveBeenCalledWith({
      data: [
        { taskId: 't-new', dependsOnTaskId: 'd1' },
        { taskId: 't-new', dependsOnTaskId: 'd2' },
      ],
    });
  });
});

describe('create_task happy path (no deps)', () => {
  beforeEach(() => resolveFeature.mockResolvedValue(granted));

  it('creates an available task, audits, and does not query deps', async () => {
    mockTxCreatesTask('t-1', 'available');
    const r = await cap.execute({ featureId: 'f1', title: 'Ship it' }, ctx());

    expect(r.data).toEqual({ taskId: 't-1', status: 'available', featureId: 'f1' });
    expect(taskFindMany).not.toHaveBeenCalled();
    expect(txDepCreateMany).not.toHaveBeenCalled();
    // Atomic project-wide number: bump the counter, stamp the returned value.
    expect(txProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { taskCounter: { increment: 1 } } })
    );
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 7 }) })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        action: 'task.create',
        entityType: 'app_task',
        entityId: 't-1',
        entityName: 'Ship it',
      })
    );
  });

  it('journals a task_created event inside the same transaction', async () => {
    mockTxCreatesTask('t-1', 'available');
    await cap.execute({ featureId: 'f1', title: 'Ship it' }, ctx());

    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f1',
      taskId: 't-1',
      kind: 'task_created',
      actorUserId: USER,
      metadata: { status: 'available' },
    });
    // Atomicity: the event is written with the *transaction* client (the same
    // object carrying the task create), so it commits iff the task does.
    expect(emit.mock.calls[0][0].task.create).toBe(txTaskCreate);
  });
});

describe('create_task redactProvenance', () => {
  it('redacts the free-text title on the durable provenance row', () => {
    const args = { featureId: 'f1', title: 'secret title text', filesScope: ['api/'] };
    const out = cap.redactProvenance(args, {
      success: true,
      data: { taskId: 't', status: 'available', featureId: 'f1' },
    });
    const redactedArgs = out.args as { title: string; featureId: string };
    expect(redactedArgs.featureId).toBe('f1');
    expect(redactedArgs.title).not.toContain('secret title text');
  });
});
