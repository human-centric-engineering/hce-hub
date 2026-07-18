/**
 * Tests for `lib/projects/capabilities/plan-feature.ts` — the owner-tier verb that
 * turns an indicative feature into real tasks. Pins the funnel (not_found /
 * forbidden), the already_planned guard, duplicate-ref + dependency-integrity
 * checks, the real cycle guard (a self-referential batch is rejected, nothing
 * written), and the transactional materialise (numbered + owner-assigned tasks,
 * batch-ref → id dependency wiring, indicative-list replacement, planningStage
 * flip, feature_planned + task_created events). `assertAcyclic` runs for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { task: { findMany: vi.fn() } } }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { PlanFeatureCapability } = await import('@/lib/projects/capabilities/plan-feature');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const cap = new PlanFeatureCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

const granted = (over: Partial<{ ownerUserId: string | null; planningStage: string }> = {}) => ({
  ok: true,
  feature: {
    projectId: 'p1',
    // `in over` distinguishes an explicit null owner from "not provided".
    ownerUserId: 'ownerUserId' in over ? over.ownerUserId : USER,
    status: 'in_flight',
    planningStage: over.planningStage ?? 'indicative',
    helpWanted: false,
    basis: 'member',
  },
});

// tx mock: counter bumps 10, 11, …; task.create returns id-0, id-1, … in order.
const txProjectUpdate = vi.fn();
const txTaskCreate = vi.fn();
const txTaskDepCreateMany = vi.fn();
const txIndicativeDeleteMany = vi.fn();
const txFeatureUpdate = vi.fn();
function mockTx() {
  let counter = 10;
  let created = 0;
  txProjectUpdate.mockImplementation(async () => ({ taskCounter: ++counter }));
  txTaskCreate.mockImplementation(async () => ({ id: `id-${created++}` }));
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      project: { update: txProjectUpdate },
      task: { create: txTaskCreate },
      taskDependency: { createMany: txTaskDepCreateMany },
      indicativeTask: { deleteMany: txIndicativeDeleteMany },
      feature: { update: txFeatureUpdate },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx();
});

const oneTask = [{ ref: 't1', title: 'do it' }];

describe('plan_feature guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ featureId: 'f1', tasks: oneTask }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(resolveFeature).not.toHaveBeenCalled();
  });

  it('maps a non-member/missing feature to not_found', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ featureId: 'f1', tasks: oneTask }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('maps a member-without-owner-rights to forbidden', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const r = await cap.execute({ featureId: 'f1', tasks: oneTask }, ctx());
    expect(r.error?.code).toBe('forbidden');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects an already-planned feature (would strand existing tasks)', async () => {
    resolveFeature.mockResolvedValue(granted({ planningStage: 'planned' }));
    const r = await cap.execute({ featureId: 'f1', tasks: oneTask }, ctx());
    expect(r.error?.code).toBe('already_planned');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects duplicate refs within the batch', async () => {
    resolveFeature.mockResolvedValue(granted());
    const r = await cap.execute(
      {
        featureId: 'f1',
        tasks: [
          { ref: 't1', title: 'a' },
          { ref: 't1', title: 'b' },
        ],
      },
      ctx()
    );
    expect(r.error?.code).toBe('duplicate_ref');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('plan_feature dependency integrity + cycle guard', () => {
  beforeEach(() => resolveFeature.mockResolvedValue(granted()));

  it('rejects existing-task deps not found in the project', async () => {
    taskFindMany.mockResolvedValue([]); // 'existing-1' not found
    const r = await cap.execute(
      { featureId: 'f1', tasks: [{ ref: 't1', title: 'a', dependsOn: ['existing-1'] }] },
      ctx()
    );
    expect(r.error?.code).toBe('invalid_dependency');
    expect(runTx).not.toHaveBeenCalled();
    // Only the non-ref ids are checked, scoped to the feature's project.
    expect(taskFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['existing-1'] }, feature: { projectId: 'p1' } },
      select: { id: true },
    });
  });

  it('rejects a cyclic batch (t1→t2→t1) before writing anything', async () => {
    const r = await cap.execute(
      {
        featureId: 'f1',
        tasks: [
          { ref: 't1', title: 'a', dependsOn: ['t2'] },
          { ref: 't2', title: 'b', dependsOn: ['t1'] },
        ],
      },
      ctx()
    );
    expect(r.error?.code).toBe('dependency_cycle');
    expect(runTx).not.toHaveBeenCalled();
    // A batch-internal cycle needs no DB lookup (both are refs, not existing ids).
    expect(taskFindMany).not.toHaveBeenCalled();
  });
});

describe('plan_feature materialise', () => {
  beforeEach(() => resolveFeature.mockResolvedValue(granted()));

  it('creates numbered, owner-assigned tasks, wires deps, replaces sketch, flips stage', async () => {
    taskFindMany.mockResolvedValue([{ id: 'existing-1' }]);

    const r = await cap.execute(
      {
        featureId: 'f1',
        tasks: [
          { ref: 't1', title: 'schema', doneWhen: 'migrates', filesScope: ['prisma/'] },
          { ref: 't2', title: 'verbs', dependsOn: ['t1', 'existing-1'] },
        ],
      },
      ctx()
    );

    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      featureId: 'f1',
      taskIds: ['id-0', 'id-1'],
      planningStage: 'planned',
    });

    // First task: numbered from the counter, owner-assigned, available, done-when.
    expect(txTaskCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          featureId: 'f1',
          number: 11,
          title: 'schema',
          doneWhen: 'migrates',
          status: 'available',
          filesScope: ['prisma/'],
          assigneeUserId: USER,
        }),
      })
    );
    // Deps resolve batch ref t1 → id-0, existing id passes through.
    expect(txTaskDepCreateMany).toHaveBeenCalledWith({
      data: [
        { taskId: 'id-1', dependsOnTaskId: 'id-0' },
        { taskId: 'id-1', dependsOnTaskId: 'existing-1' },
      ],
    });
    // Planning REPLACES the indicative sketch and marks the feature planned.
    expect(txIndicativeDeleteMany).toHaveBeenCalledWith({ where: { featureId: 'f1' } });
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { planningStage: 'planned' },
    });
  });

  it('assigns null when a lead plans an unowned feature', async () => {
    resolveFeature.mockResolvedValue(granted({ ownerUserId: null }));
    await cap.execute({ featureId: 'f1', tasks: oneTask }, ctx());
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeUserId: null }) })
    );
  });

  it('journals feature_planned + one task_created per task, in the same tx', async () => {
    await cap.execute(
      {
        featureId: 'f1',
        tasks: [
          { ref: 't1', title: 'a' },
          { ref: 't2', title: 'b' },
        ],
      },
      ctx()
    );

    const kinds = emit.mock.calls.map((c) => c[1].kind);
    expect(kinds).toEqual(['feature_planned', 'task_created', 'task_created']);
    expect(emit.mock.calls[0][1]).toMatchObject({
      projectId: 'p1',
      featureId: 'f1',
      actorUserId: USER,
      metadata: { taskCount: 2 },
    });
    // task_created events carry the created task ids.
    expect(emit.mock.calls[1][1]).toMatchObject({ taskId: 'id-0', kind: 'task_created' });
    expect(emit.mock.calls[2][1]).toMatchObject({ taskId: 'id-1', kind: 'task_created' });
    // Atomic with the write (same tx client that created the tasks).
    expect(emit.mock.calls[0][0].task.create).toBe(txTaskCreate);
  });
});

describe('plan_feature redactProvenance', () => {
  it('masks each task title + done-when, keeps structural fields', () => {
    const out = cap.redactProvenance(
      {
        featureId: 'f1',
        tasks: [{ ref: 't1', title: 'secret title', doneWhen: 'secret done', dependsOn: ['t0'] }],
      },
      { success: true, data: { featureId: 'f1', taskIds: ['x'], planningStage: 'planned' } }
    );
    const tasks = (out.args as { tasks: Record<string, unknown>[] }).tasks;
    expect(tasks[0].ref).toBe('t1');
    expect(tasks[0].dependsOn).toEqual(['t0']);
    expect(String(tasks[0].title)).not.toContain('secret title');
    expect(String(tasks[0].doneWhen)).not.toContain('secret done');
  });
});
