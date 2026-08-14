/**
 * Tests for `lib/projects/capabilities/create-task.ts`.
 *
 * A write capability, so its matrix pins the authz funnel (owner-tier via
 * resolveFeatureAccess — deny ≡ not_found), dependency-integrity validation
 * (deps must exist in the same project), the transactional create, the audit
 * write, and free-text provenance redaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { TaskKind } from '@prisma/client';

vi.mock('@/lib/projects/access', () => ({ resolveFeatureAccess: vi.fn() }));
vi.mock('@/lib/projects/phases-service', () => ({ phaseBelongsToProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { task: { findMany: vi.fn() }, idea: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { resolveFeatureAccess } = await import('@/lib/projects/access');
const { phaseBelongsToProject } = await import('@/lib/projects/phases-service');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { CreateTaskCapability } = await import('@/lib/projects/capabilities/create-task');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const ideaFindFirst = prisma.idea.findFirst as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const phaseInProject = phaseBelongsToProject as ReturnType<typeof vi.fn>;

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
const txIdeaUpdateMany = vi.fn();
function mockTxCreatesTask(id = 't-new', status = 'claimed', nextNumber = 7) {
  // Echo the assigned number back (as the real `select: { id, number, status }` does).
  txTaskCreate.mockResolvedValue({ id, number: nextNumber, status });
  txProjectUpdate.mockResolvedValue({ taskCounter: nextNumber });
  txIdeaUpdateMany.mockResolvedValue({ count: 1 });
  // The mock runs the capability's real tx callback so we can assert what it
  // wrote; the untyped vi.fn() infers a void-returning impl, hence the disable.
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      project: { update: txProjectUpdate },
      task: { create: txTaskCreate },
      taskDependency: { createMany: txDepCreateMany },
      idea: { updateMany: txIdeaUpdateMany },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Set here, not in a describe-level hook: `clearAllMocks` clears CALLS but not
  // implementations, so a mock set in one block silently satisfies another and
  // the test passes for the wrong reason (it did — the phase tests below only
  // passed in a whole-file run, and failed under `-t`). Global default keeps
  // every block honest under `.only`, reordering, or a switch to resetAllMocks.
  phaseInProject.mockResolvedValue(true);
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
  beforeEach(() => {
    resolveFeature.mockResolvedValue(granted);
    phaseInProject.mockResolvedValue(true);
  });

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
    mockTxCreatesTask('t-new', 'claimed');

    const r = await cap.execute(
      { featureId: 'f1', title: 'Wire auth', dependsOnTaskIds: ['d1', 'd2', 'd1'] },
      ctx()
    );

    expect(r).toEqual({
      success: true,
      data: { taskId: 't-new', number: 7, status: 'claimed', featureId: 'f1' },
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

  it('creates a claimed task owned by the feature owner, audits, and does not query deps', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    const r = await cap.execute({ featureId: 'f1', title: 'Ship it' }, ctx());

    // Reports the assigned t-N so the caller can say "created t-7" (t-66).
    expect(r.data).toEqual({ taskId: 't-1', number: 7, status: 'claimed', featureId: 'f1' });
    expect(taskFindMany).not.toHaveBeenCalled();
    expect(txDepCreateMany).not.toHaveBeenCalled();
    // Atomic project-wide number: bump the counter, stamp the returned value.
    expect(txProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { taskCounter: { increment: 1 } } })
    );
    // Born claimed, owned by the feature owner (f-status-model §20): both the
    // assignee and the held-by claimant point at the granted feature's owner.
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: 7,
          status: 'claimed',
          assigneeUserId: USER,
          claimedByUserId: USER,
        }),
      })
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

  it('commits a new task to a phase when one is given', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    await cap.execute({ featureId: 'f1', title: 'Ship it', phaseId: 'ph1' }, ctx());
    expect(phaseInProject).toHaveBeenCalledWith('ph1', 'p1');
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phaseId: 'ph1' }) })
    );
  });

  it('defaults to inheriting the feature phase (null) when none is given', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    await cap.execute({ featureId: 'f1', title: 'Ship it' }, ctx());
    // Null = inherit, which is the pre-§32 behaviour — the column ships inert.
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phaseId: null }) })
    );
  });

  it('accepts a null phaseId as "inherit" rather than rejecting it', async () => {
    // update_task and update_feature both take a nullable phaseId, and the JSON
    // functionDefinition carries no nullability signal — so an agent emitting
    // null here is doing the natural thing and must not get a Zod error.
    mockTxCreatesTask('t-1', 'claimed');
    const r = await cap.execute({ featureId: 'f1', title: 'Ship it', phaseId: null }, ctx());
    expect(r.success).toBe(true);
    expect(phaseInProject).not.toHaveBeenCalled(); // nothing to validate
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phaseId: null }) })
    );
  });

  it('rejects a phase from another project without creating the task', async () => {
    phaseInProject.mockResolvedValue(false);
    const r = await cap.execute({ featureId: 'f1', title: 'Ship it', phaseId: 'elsewhere' }, ctx());
    expect(r.error?.code).toBe('invalid_phase');
    expect(txTaskCreate).not.toHaveBeenCalled();
  });

  it('persists description + doneWhen when supplied (f-authoring-fidelity §21 t-a)', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    await cap.execute(
      {
        featureId: 'f1',
        title: 'Ship it',
        description: '## Detail\nBuild the thing.',
        doneWhen: 'the thing builds',
      },
      ctx()
    );
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: '## Detail\nBuild the thing.',
          doneWhen: 'the thing builds',
        }),
      })
    );
  });

  it('defaults description + doneWhen to null when omitted', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    await cap.execute({ featureId: 'f1', title: 'Ship it' }, ctx());
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null, doneWhen: null }),
      })
    );
  });

  it('journals a task_created event inside the same transaction', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    await cap.execute({ featureId: 'f1', title: 'Ship it' }, ctx());

    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f1',
      taskId: 't-1',
      kind: 'task_created',
      actorUserId: USER,
      metadata: { status: 'claimed', kind: 'feature_work' },
    });
    // Atomicity: the event is written with the *transaction* client (the same
    // object carrying the task create), so it commits iff the task does.
    expect(emit.mock.calls[0][0].task.create).toBe(txTaskCreate);
  });

  it('defaults an unspecified kind to feature_work', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    await cap.execute({ featureId: 'f1', title: 'x' }, ctx());
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'feature_work' }) })
    );
  });

  it('records a bug-kind task with kind on the row and journals bug_reported (§22-02)', async () => {
    mockTxCreatesTask('t-1', 'claimed');
    await cap.execute({ featureId: 'f1', title: 'Log renders raw', kind: 'bug' }, ctx());

    // The task carries its kind…
    expect(txTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'bug' }) })
    );
    // …and the journal distinguishes it as bug_reported, not task_created, so
    // "which shipped work generates defects" stays queryable.
    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f1',
      taskId: 't-1',
      kind: 'bug_reported',
      actorUserId: USER,
      metadata: { status: 'claimed', kind: 'bug' },
    });
  });
});

describe('create_task promotion (fromIdeaId)', () => {
  beforeEach(() => {
    resolveFeature.mockResolvedValue(granted);
    taskFindMany.mockResolvedValue([]);
  });

  it('promotes an open idea into a task (kind "task"), scoped to the feature project', async () => {
    ideaFindFirst.mockResolvedValue({ status: 'open' });
    mockTxCreatesTask('t-new', 'claimed', 7);

    const r = await cap.execute({ featureId: 'f1', title: 'do it', fromIdeaId: 'idea-1' }, ctx());

    expect(r.success).toBe(true);
    expect(ideaFindFirst).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1' },
      select: { status: true },
    });
    expect(txIdeaUpdateMany).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1', status: 'open' },
      data: {
        status: 'promoted',
        promotedKind: 'task',
        promotedRefId: 't-new',
        triagedAt: expect.any(Date),
      },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ fromIdeaId: 'idea-1' }) })
    );
  });

  it('promotes an idea straight to a bug when kind:"bug" (outcome "bug")', async () => {
    ideaFindFirst.mockResolvedValue({ status: 'open' });
    mockTxCreatesTask('t-bug', 'claimed', 8);

    await cap.execute(
      { featureId: 'f1', title: 'logout leak', kind: 'bug', fromIdeaId: 'idea-2' },
      ctx()
    );

    expect(txIdeaUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ promotedKind: 'bug', promotedRefId: 't-bug' }),
      })
    );
  });

  it('rejects an unknown idea (invalid_idea) and an already-triaged idea (idea_not_open), no write', async () => {
    ideaFindFirst.mockResolvedValueOnce(null);
    expect(
      (await cap.execute({ featureId: 'f1', title: 'x', fromIdeaId: 'ghost' }, ctx())).error?.code
    ).toBe('invalid_idea');

    ideaFindFirst.mockResolvedValueOnce({ status: 'dropped' });
    expect(
      (await cap.execute({ featureId: 'f1', title: 'x', fromIdeaId: 'idea-3' }, ctx())).error?.code
    ).toBe('idea_not_open');

    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('create_task tool schema', () => {
  it('advertises every TaskKind value', () => {
    // The Zod schema uses `nativeEnum(TaskKind)` so it tracks the enum, but this
    // JSON copy is hand-written and is what MCP clients see. It is exactly the
    // copy that went stale when `enhancement` was added (f-work-kinds §32 t-79) —
    // an agent cannot pass a kind the tool never advertised, and no type-check
    // catches it. Pinned to the enum, not to a literal list.
    const params = z
      .object({ properties: z.object({ kind: z.object({ enum: z.array(z.string()) }) }) })
      .parse(cap.functionDefinition.parameters);
    expect(params.properties.kind.enum).toEqual(Object.values(TaskKind));
  });
});

describe('create_task redactProvenance', () => {
  it('redacts the free-text title / description / doneWhen on the durable provenance row', () => {
    const args = {
      featureId: 'f1',
      title: 'secret title text',
      description: 'secret description body',
      doneWhen: 'secret acceptance contract',
      filesScope: ['api/'],
    };
    const out = cap.redactProvenance(args, {
      success: true,
      data: { taskId: 't', number: 1, status: 'claimed', featureId: 'f1' },
    });
    const redactedArgs = out.args as {
      title: string;
      description: string;
      doneWhen: string;
      featureId: string;
    };
    expect(redactedArgs.featureId).toBe('f1');
    expect(redactedArgs.title).not.toContain('secret title text');
    expect(redactedArgs.description).not.toContain('secret description body');
    expect(redactedArgs.doneWhen).not.toContain('secret acceptance contract');
  });

  it('leaves description / doneWhen null in provenance when omitted', () => {
    const out = cap.redactProvenance(
      { featureId: 'f1', title: 't' },
      { success: true, data: { taskId: 't', number: 1, status: 'claimed', featureId: 'f1' } }
    );
    const redactedArgs = out.args as { description: string | null; doneWhen: string | null };
    expect(redactedArgs.description).toBeNull();
    expect(redactedArgs.doneWhen).toBeNull();
  });
});
