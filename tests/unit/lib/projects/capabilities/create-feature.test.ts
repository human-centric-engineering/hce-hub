/**
 * Tests for `lib/projects/capabilities/create-feature.ts` — the member-tier
 * feature author. Pins the membership funnel (deny ≡ not_found), slug-collision
 * and dependency-integrity pre-checks, the transactional create (unowned +
 * indicative, deps, indicative-task sketch, feature_created event), and free-text
 * provenance redaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ canAccessProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    feature: { findFirst: vi.fn(), findMany: vi.fn() },
    phase: { findFirst: vi.fn() },
    idea: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { canAccessProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { CreateFeatureCapability } = await import('@/lib/projects/capabilities/create-feature');

const access = canAccessProject as ReturnType<typeof vi.fn>;
const featureFindFirst = prisma.feature.findFirst as ReturnType<typeof vi.fn>;
const featureFindMany = prisma.feature.findMany as ReturnType<typeof vi.fn>;
const phaseFindFirst = prisma.phase.findFirst as ReturnType<typeof vi.fn>;
const ideaFindFirst = prisma.idea.findFirst as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const cap = new CreateFeatureCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

const txFeatureCreate = vi.fn();
const txFeatureDepCreateMany = vi.fn();
const txIndicativeCreateMany = vi.fn();
const txProjectUpdate = vi.fn();
const txIdeaUpdateMany = vi.fn();
function mockTxCreatesFeature(id = 'f-new', slug: string | null = null, nextNumber = 3) {
  txFeatureCreate.mockResolvedValue({ id, slug });
  txProjectUpdate.mockResolvedValue({ featureCounter: nextNumber });
  txIdeaUpdateMany.mockResolvedValue({ count: 1 });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      project: { update: txProjectUpdate },
      feature: { create: txFeatureCreate },
      featureDependency: { createMany: txFeatureDepCreateMany },
      indicativeTask: { createMany: txIndicativeCreateMany },
      idea: { updateMany: txIdeaUpdateMany },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('create_feature guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ projectId: 'p1', title: 'x' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(access).not.toHaveBeenCalled();
  });

  it('maps a non-member/missing project to not_found (no enumeration)', async () => {
    access.mockResolvedValue({ ok: false, basis: null });
    const r = await cap.execute({ projectId: 'p1', title: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('create_feature validation', () => {
  beforeEach(() => access.mockResolvedValue({ ok: true, basis: 'member' }));

  it('rejects a slug that already exists in the project', async () => {
    featureFindFirst.mockResolvedValue({ id: 'f-existing' });
    const r = await cap.execute({ projectId: 'p1', title: 'x', slug: 'f-mcp' }, ctx());
    expect(r.error?.code).toBe('slug_taken');
    expect(runTx).not.toHaveBeenCalled();
    expect(featureFindFirst).toHaveBeenCalledWith({
      where: { projectId: 'p1', slug: 'f-mcp' },
      select: { id: true },
    });
  });

  it('rejects dependencies not all present in the same project', async () => {
    featureFindMany.mockResolvedValue([{ id: 'd1' }]); // only 1 of 2
    const r = await cap.execute(
      { projectId: 'p1', title: 'x', dependsOnFeatureIds: ['d1', 'd2'] },
      ctx()
    );
    expect(r.error?.code).toBe('invalid_dependency');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects a phaseId that is not a phase in this project (invalid_phase, no write)', async () => {
    phaseFindFirst.mockResolvedValue(null); // no such phase in the project
    const r = await cap.execute({ projectId: 'p1', title: 'x', phaseId: 'ph-other' }, ctx());
    expect(r.error?.code).toBe('invalid_phase');
    expect(phaseFindFirst).toHaveBeenCalledWith({
      where: { id: 'ph-other', projectId: 'p1' },
      select: { id: true },
    });
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('create_feature happy path', () => {
  beforeEach(() => {
    access.mockResolvedValue({ ok: true, basis: 'member' });
    // No slug clash / no deps by default; individual tests override.
    featureFindFirst.mockResolvedValue(null);
    featureFindMany.mockResolvedValue([]);
  });

  it('creates an unowned, indicative feature and journals feature_created', async () => {
    mockTxCreatesFeature('f-new', 'f-mcp', 3);

    const r = await cap.execute(
      { projectId: 'p1', title: 'MCP server', slug: 'f-mcp', doneWhen: 'tools list' },
      ctx()
    );

    expect(r).toEqual({ success: true, data: { featureId: 'f-new', slug: 'f-mcp' } });
    // Unowned (you claim features, not tasks) + indicative + planning.
    expect(txFeatureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'p1',
          title: 'MCP server',
          slug: 'f-mcp',
          doneWhen: 'tools list',
          status: 'planning',
          planningStage: 'indicative',
          ownerUserId: null,
        }),
      })
    );
    expect(txFeatureDepCreateMany).not.toHaveBeenCalled();
    expect(txIndicativeCreateMany).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f-new',
      kind: 'feature_created',
      actorUserId: USER,
      metadata: { slug: 'f-mcp' },
    });
    // Atomicity: the event uses the same tx client that created the feature.
    expect(emit.mock.calls[0][0].feature.create).toBe(txFeatureCreate);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'feature.create', entityId: 'f-new' })
    );
  });

  it('files the feature under a valid phase (born filed) when phaseId is supplied', async () => {
    phaseFindFirst.mockResolvedValue({ id: 'ph1' }); // a real phase in this project
    mockTxCreatesFeature('f-new', 'f-mcp', 3);

    const r = await cap.execute({ projectId: 'p1', title: 'MCP server', phaseId: 'ph1' }, ctx());

    expect(r.success).toBe(true);
    expect(txFeatureCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phaseId: 'ph1' }) })
    );
    // Born-filed is recorded in the journal + audit (distinguishable from a later move).
    expect(emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ phaseId: 'ph1' }) })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ phaseId: 'ph1' }) })
    );
  });

  it('omits phaseId from the create when not supplied (unfiled)', async () => {
    mockTxCreatesFeature('f-new', 'f-x', 4);
    await cap.execute({ projectId: 'p1', title: 'X' }, ctx());
    expect(phaseFindFirst).not.toHaveBeenCalled();
    const data = txFeatureCreate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('phaseId');
  });

  it('persists a summary when supplied, defaults it to null otherwise (§21 t-d)', async () => {
    mockTxCreatesFeature('f-new', 'f-mcp', 3);
    await cap.execute(
      { projectId: 'p1', title: 'MCP server', summary: 'the MCP server, briefly' },
      ctx()
    );
    expect(txFeatureCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ summary: 'the MCP server, briefly' }),
      })
    );

    vi.clearAllMocks();
    mockTxCreatesFeature('f-new2', 'f-x', 4);
    await cap.execute({ projectId: 'p1', title: 'X' }, ctx());
    expect(txFeatureCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ summary: null }) })
    );
  });

  it("bumps the project featureCounter and stamps the returned value as the new feature's number (f-status-model §20 t-37)", async () => {
    mockTxCreatesFeature('f-new', 'f-mcp', 9);

    await cap.execute({ projectId: 'p1', title: 'MCP server', slug: 'f-mcp' }, ctx());

    expect(txProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { featureCounter: { increment: 1 } },
      })
    );
    expect(txFeatureCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 9 }) })
    );
  });

  it('writes ordered indicative tasks and de-duplicated dependency edges', async () => {
    featureFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    mockTxCreatesFeature('f-new', null);

    await cap.execute(
      {
        projectId: 'p1',
        title: 'Auth',
        dependsOnFeatureIds: ['d1', 'd2', 'd1'],
        indicativeTasks: ['sketch schema', 'wire guard'],
      },
      ctx()
    );

    expect(txFeatureDepCreateMany).toHaveBeenCalledWith({
      data: [
        { featureId: 'f-new', dependsOnFeatureId: 'd1' },
        { featureId: 'f-new', dependsOnFeatureId: 'd2' },
      ],
    });
    expect(txIndicativeCreateMany).toHaveBeenCalledWith({
      data: [
        { featureId: 'f-new', order: 0, text: 'sketch schema' },
        { featureId: 'f-new', order: 1, text: 'wire guard' },
      ],
    });
  });
});

describe('create_feature promotion (fromIdeaId)', () => {
  beforeEach(() => {
    access.mockResolvedValue({ ok: true, basis: 'member' });
    featureFindFirst.mockResolvedValue(null);
    featureFindMany.mockResolvedValue([]);
  });

  it('promotes an open idea: marks it promoted (feature) in the same tx, records fromIdeaId', async () => {
    ideaFindFirst.mockResolvedValue({ status: 'open' });
    mockTxCreatesFeature('f-new', 'f-mcp', 3);

    const r = await cap.execute(
      { projectId: 'p1', title: 'MCP server', slug: 'f-mcp', fromIdeaId: 'idea-1' },
      ctx()
    );

    expect(r.success).toBe(true);
    // Precheck scoped to THIS project.
    expect(ideaFindFirst).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1' },
      select: { status: true },
    });
    // Resolve is guarded on status:'open' (race backstop) and links the feature.
    expect(txIdeaUpdateMany).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1', status: 'open' },
      data: {
        status: 'promoted',
        promotedKind: 'feature',
        promotedRefId: 'f-new',
        triagedAt: expect.any(Date),
      },
    });
    // The journal + audit note the promotion source.
    expect(emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ fromIdeaId: 'idea-1' }) })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ fromIdeaId: 'idea-1' }) })
    );
  });

  it('rejects promotion of an unknown idea (invalid_idea, no write)', async () => {
    ideaFindFirst.mockResolvedValue(null);
    const r = await cap.execute({ projectId: 'p1', title: 'x', fromIdeaId: 'ghost' }, ctx());
    expect(r.error?.code).toBe('invalid_idea');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects promotion of an already-triaged idea (idea_not_open, no write)', async () => {
    ideaFindFirst.mockResolvedValue({ status: 'promoted' });
    const r = await cap.execute({ projectId: 'p1', title: 'x', fromIdeaId: 'idea-1' }, ctx());
    expect(r.error?.code).toBe('idea_not_open');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('create_feature redactProvenance', () => {
  it('masks free text, keeps scope + slug + dep ids', () => {
    const out = cap.redactProvenance(
      {
        projectId: 'p1',
        title: 'secret title',
        summary: 'secret summary',
        description: 'secret desc',
        doneWhen: 'secret done',
        slug: 'f-mcp',
        references: [{ label: 'l', target: 't' }],
        dependsOnFeatureIds: ['d1'],
        indicativeTasks: ['a', 'b'],
      },
      { success: true, data: { featureId: 'f', slug: 'f-mcp' } }
    );
    const a = out.args as Record<string, unknown>;
    expect(a.projectId).toBe('p1');
    expect(a.slug).toBe('f-mcp');
    expect(a.dependsOnFeatureIds).toEqual(['d1']);
    expect(String(a.title)).not.toContain('secret title');
    expect(String(a.summary)).not.toContain('secret summary');
    expect(String(a.description)).not.toContain('secret desc');
    expect(String(a.doneWhen)).not.toContain('secret done');
  });
});
