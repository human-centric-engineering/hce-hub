/**
 * Tests for `lib/projects/capabilities/update-task.ts` (f-authoring-fidelity §21
 * t-b; dependency edges added by t-86). An owner-tier edit verb, so the matrix
 * pins: the no-user guard, the nothing_to_update guard, the funnel (missing task
 * → not_found; non-member → not_found; member-non-owner → forbidden), the
 * partial-patch semantics (undefined = untouched, null = clear, filesScope via
 * `{ set }`), the dependency-edge replacement with the REAL cycle guard
 * (self-loop + cycle rejected, nothing written), invalid dependency, the audit
 * write, and free-text provenance redaction. `assertAcyclic` runs for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { Prisma, TaskKind } from '@prisma/client';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { task: { findUnique: vi.fn(), findMany: vi.fn() } },
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
// `@/lib/projects/write-conflict` is deliberately NOT mocked — the real
// `isWriteConflict` runs against the error the transaction throws, so the P2034
// mapping is proven rather than assumed.
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { UpdateTaskCapability } = await import('@/lib/projects/capabilities/update-task');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const taskFindUnique = prisma.task.findUnique as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new UpdateTaskCapability();
const USER = 'user-1';
/** Postgres SSI aborts the loser of a write conflict; Prisma surfaces P2034. */
const writeConflict = () =>
  new Prisma.PrismaClientKnownRequestError('write conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });
const ctx = (userId: string | null = USER, scope?: Record<string, string>) => ({
  userId,
  agentId: 'a1',
  ...(scope ? { scope } : {}),
});
const grantedOwner = { ok: true, feature: { projectId: 'p1', ownerUserId: USER, basis: 'member' } };

const txTaskUpdate = vi.fn();
const txDepFindMany = vi.fn();
const txDepDeleteMany = vi.fn();
const txDepCreateMany = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  taskFindUnique.mockResolvedValue({ id: 't1', featureId: 'f1', feature: { projectId: 'p1' } });
  taskFindMany.mockResolvedValue([]);
  resolveFeature.mockResolvedValue(grantedOwner);

  txTaskUpdate.mockResolvedValue({});
  txDepFindMany.mockResolvedValue([]);
  txDepDeleteMany.mockResolvedValue({});
  txDepCreateMany.mockResolvedValue({});
  // The graph read now lives INSIDE the transaction, so it is a `tx` method.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      task: { update: txTaskUpdate },
      taskDependency: {
        findMany: txDepFindMany,
        deleteMany: txDepDeleteMany,
        createMany: txDepCreateMany,
      },
    })
  );
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
    expect(runTx).not.toHaveBeenCalled();
  });

  it('maps a missing task to not_found (no write)', async () => {
    taskFindUnique.mockResolvedValue(null);
    const r = await cap.execute({ taskId: 't1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(resolveFeature).not.toHaveBeenCalled();
    expect(runTx).not.toHaveBeenCalled();
  });

  it('maps a non-member (funnel not_found) to not_found — no enumeration', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ taskId: 't1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('maps a member-without-owner-rights to forbidden', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'forbidden' });
    const r = await cap.execute({ taskId: 't1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('forbidden');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('update_task patch semantics', () => {
  it('updates only the supplied fields and reports them (undefined = untouched)', async () => {
    const r = await cap.execute({ taskId: 't1', title: 'New title', doneWhen: 'it works' }, ctx());
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ taskId: 't1', updated: ['title', 'doneWhen'] });
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { title: 'New title', doneWhen: 'it works' },
    });
    // No dependency work when the field is absent.
    expect(txDepDeleteMany).not.toHaveBeenCalled();
    // The task is scoped by its feature at the owner tier.
    expect(resolveFeature).toHaveBeenCalledWith(USER, 'f1', 'owner', undefined);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'task.update',
        entityId: 't1',
        metadata: { fields: ['title', 'doneWhen'] },
      })
    );
  });

  it("forwards a project-scoped key's projectId as the cross-project guard", async () => {
    await cap.execute({ taskId: 't1', title: 'x' }, ctx(USER, { projectId: 'proj-scoped' }));
    // The scope reaches resolveFeatureAccess as expectedProjectId → a task whose
    // feature is outside the key's project is not_found (hard isolation).
    expect(resolveFeature).toHaveBeenCalledWith(USER, 'f1', 'owner', 'proj-scoped');
  });

  it('clears description / doneWhen when passed null', async () => {
    const r = await cap.execute({ taskId: 't1', description: null, doneWhen: null }, ctx());
    expect(r.data?.updated).toEqual(['description', 'doneWhen']);
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { description: null, doneWhen: null },
    });
  });

  it('re-files a mis-filed task from bug to enhancement', async () => {
    // The motivating correction (f-work-kinds §32 t-79): before `enhancement`
    // existed, an improvement had to be filed as `bug` to keep it off a shipped
    // feature's progress bar, so the record contains "bugs" that were never
    // defects. This is how they get put right without touching the DB.
    const r = await cap.execute({ taskId: 't1', kind: 'enhancement' }, ctx());
    expect(r.data?.updated).toEqual(['kind']);
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { kind: 'enhancement' },
    });
  });

  it('advertises every TaskKind value in the tool schema', () => {
    // The Zod schema derives from `TaskKind` and so can't drift, but the
    // `functionDefinition` JSON is hand-written — and it is what MCP clients
    // actually see. That copy DID go stale when the enum grew: `create_task`
    // still advertised ['feature_work','bug'] after `enhancement` landed, which
    // no type-check catches. Pin it to the enum instead of to a literal list.
    const kind = z
      .object({ properties: z.object({ kind: z.object({ enum: z.array(z.string()) }) }) })
      .parse(cap.functionDefinition.parameters);
    expect(kind.properties.kind.enum).toEqual(Object.values(TaskKind));
  });

  it('replaces filesScope via a `set` (scalar-list update)', async () => {
    await cap.execute({ taskId: 't1', filesScope: ['lib/a.ts', 'lib/b.ts'] }, ctx());
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { filesScope: { set: ['lib/a.ts', 'lib/b.ts'] } },
    });
  });
});

describe('update_task dependency replacement', () => {
  it('accepts dependsOnTaskIds alone — it is an editable field, not "nothing to update"', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    const r = await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2'] }, ctx());
    expect(r.success).toBe(true);
    expect(r.data?.updated).toEqual(['dependencies']);
    // No scalar patch → the task row itself is never touched.
    expect(txTaskUpdate).not.toHaveBeenCalled();
  });

  it('replaces the outgoing edge set (delete then create)', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }, { id: 't3' }]);
    await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2', 't3'] }, ctx());
    expect(txDepDeleteMany).toHaveBeenCalledWith({ where: { taskId: 't1' } });
    expect(txDepCreateMany).toHaveBeenCalledWith({
      data: [
        { taskId: 't1', dependsOnTaskId: 't2' },
        { taskId: 't1', dependsOnTaskId: 't3' },
      ],
    });
  });

  it('clears every edge on an empty array (delete, no create)', async () => {
    const r = await cap.execute({ taskId: 't1', dependsOnTaskIds: [] }, ctx());
    expect(r.success).toBe(true);
    expect(txDepDeleteMany).toHaveBeenCalledWith({ where: { taskId: 't1' } });
    expect(txDepCreateMany).not.toHaveBeenCalled();
    // Nothing to validate, so no target lookup either.
    expect(taskFindMany).not.toHaveBeenCalled();
  });

  it('de-duplicates repeated ids', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2', 't2'] }, ctx());
    expect(txDepCreateMany).toHaveBeenCalledWith({
      data: [{ taskId: 't1', dependsOnTaskId: 't2' }],
    });
  });

  it('rejects a self-dependency as a cycle, writing nothing', async () => {
    const r = await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t1'] }, ctx());
    expect(r.error?.code).toBe('dependency_cycle');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects a target outside the project as invalid_dependency', async () => {
    // The project-scoped lookup returns fewer rows than requested.
    taskFindMany.mockResolvedValue([]);
    const r = await cap.execute({ taskId: 't1', dependsOnTaskIds: ['other-project'] }, ctx());
    expect(r.error?.code).toBe('invalid_dependency');
    expect(runTx).not.toHaveBeenCalled();
    // Scoped to the task's own project, resolved from its feature.
    expect(taskFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['other-project'] }, feature: { projectId: 'p1' } },
      select: { id: true },
    });
  });

  it('rejects an edge that would close a cycle against the existing graph', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    // t2 already depends on t1; making t1 depend on t2 closes t1 → t2 → t1.
    txDepFindMany.mockResolvedValue([{ taskId: 't2', dependsOnTaskId: 't1' }]);
    const r = await cap.execute(
      { taskId: 't1', title: 'New title', dependsOnTaskIds: ['t2'] },
      ctx()
    );
    expect(r.error?.code).toBe('dependency_cycle');
    expect(r.error?.message).toContain('cycle');
    // The proof now runs inside the transaction, so it IS entered — what matters
    // is that it throws out before ANY write. The scalar patch is included above
    // deliberately: rollback would undo it, but the mock can't simulate rollback,
    // so asserting it was never issued is what pins the proof-before-write order.
    expect(runTx).toHaveBeenCalled();
    expect(txTaskUpdate).not.toHaveBeenCalled();
    expect(txDepDeleteMany).not.toHaveBeenCalled();
    expect(txDepCreateMany).not.toHaveBeenCalled();
  });

  it("excludes the task's own edges from the graph it validates against", async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2'] }, ctx());
    // Its current edges are being replaced, so they must not count toward a cycle.
    expect(txDepFindMany).toHaveBeenCalledWith({
      where: { task: { feature: { projectId: 'p1' } }, taskId: { not: 't1' } },
      select: { taskId: true, dependsOnTaskId: true },
    });
  });

  it('proves acyclicity inside a Serializable transaction, not before it', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2'] }, ctx());
    // Serializable is the part that actually closes the race: under Read
    // Committed both writers would validate clean and both would commit.
    expect(runTx).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    // And the graph read must be the transaction's, not the bare client's.
    expect(txDepFindMany).toHaveBeenCalled();
  });

  it('leaves a scalar-only edit at the default isolation', async () => {
    await cap.execute({ taskId: 't1', title: 'New title' }, ctx());
    // A single-row write has nothing to serialize against. Raising its isolation
    // would trade a harmless row-lock wait for a P2034 the caller must retry —
    // and nothing retries, so the edit would simply be lost.
    expect(runTx).toHaveBeenCalledWith(expect.any(Function), undefined);
  });

  it('retries a serialization failure and succeeds on the re-run', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    // SSI aborts the loser of a write conflict, but the loser was not wrong —
    // re-running it against the winner's committed edges is the whole remedy.
    runTx.mockRejectedValueOnce(writeConflict());
    const r = await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2'] }, ctx());
    expect(r.success).toBe(true);
    expect(runTx).toHaveBeenCalledTimes(2);
  });

  it('maps an unrelenting serialization failure to concurrent_modification', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    runTx.mockRejectedValue(writeConflict());
    const r = await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2'] }, ctx());
    expect(r.error?.code).toBe('concurrent_modification');
    expect(r.error?.message).toContain('retry');
    // Bounded — a permanently-losing writer must not spin forever.
    expect(runTx).toHaveBeenCalledTimes(3);
  });

  it('does not retry a rejected edge set — a cycle is not a race', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    txDepFindMany.mockResolvedValue([{ taskId: 't2', dependsOnTaskId: 't1' }]);
    const r = await cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2'] }, ctx());
    expect(r.error?.code).toBe('dependency_cycle');
    // Re-running would just re-derive the same cycle; retrying it would triple
    // the work and could only ever return the same answer.
    expect(runTx).toHaveBeenCalledTimes(1);
  });

  it('lets an unrelated database error escape rather than mislabelling it', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    runTx.mockRejectedValue(new Error('connection reset'));
    await expect(cap.execute({ taskId: 't1', dependsOnTaskIds: ['t2'] }, ctx())).rejects.toThrow(
      'connection reset'
    );
  });

  it('combines a scalar patch and an edge replacement in one transaction', async () => {
    taskFindMany.mockResolvedValue([{ id: 't2' }]);
    const r = await cap.execute(
      { taskId: 't1', title: 'New title', dependsOnTaskIds: ['t2'] },
      ctx()
    );
    expect(r.data?.updated).toEqual(['title', 'dependencies']);
    expect(runTx).toHaveBeenCalledTimes(1);
    expect(txTaskUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { title: 'New title' },
    });
    expect(txDepCreateMany).toHaveBeenCalled();
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

  it('passes dependency ids through unmasked — they are not free text', () => {
    const out = cap.redactProvenance(
      { taskId: 't1', dependsOnTaskIds: ['t2', 't3'] },
      { success: true, data: { taskId: 't1', updated: ['dependencies'] } }
    );
    expect((out.args as { dependsOnTaskIds: unknown }).dependsOnTaskIds).toEqual(['t2', 't3']);
  });
});
