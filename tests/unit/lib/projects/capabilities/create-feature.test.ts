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
  prisma: { feature: { findFirst: vi.fn(), findMany: vi.fn() } },
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
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const cap = new CreateFeatureCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

const txFeatureCreate = vi.fn();
const txFeatureDepCreateMany = vi.fn();
const txIndicativeCreateMany = vi.fn();
function mockTxCreatesFeature(id = 'f-new', slug: string | null = null) {
  txFeatureCreate.mockResolvedValue({ id, slug });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      feature: { create: txFeatureCreate },
      featureDependency: { createMany: txFeatureDepCreateMany },
      indicativeTask: { createMany: txIndicativeCreateMany },
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
});

describe('create_feature happy path', () => {
  beforeEach(() => {
    access.mockResolvedValue({ ok: true, basis: 'member' });
    // No slug clash / no deps by default; individual tests override.
    featureFindFirst.mockResolvedValue(null);
    featureFindMany.mockResolvedValue([]);
  });

  it('creates an unowned, indicative feature and journals feature_created', async () => {
    mockTxCreatesFeature('f-new', 'f-mcp');

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

describe('create_feature redactProvenance', () => {
  it('masks free text, keeps scope + slug + dep ids', () => {
    const out = cap.redactProvenance(
      {
        projectId: 'p1',
        title: 'secret title',
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
    expect(String(a.description)).not.toContain('secret desc');
    expect(String(a.doneWhen)).not.toContain('secret done');
  });
});
