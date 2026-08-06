/**
 * Tests for `lib/projects/capabilities/update-feature.ts` (f-authoring-fidelity §21
 * t-e). An owner-tier edit verb that also mutates the dependency graph + ownership,
 * so the matrix pins: the funnel (not_found / forbidden), nothing_to_update, the
 * partial field patch (incl. null-clears + JSON references), the dependency-edge
 * replacement with the REAL cycle guard (self-loop + cycle rejected, nothing
 * written), invalid dependency/owner, unclaim/reassign status coupling, and
 * free-text provenance redaction. `assertAcyclic` runs for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/projects/access', () => ({
  resolveFeatureAccess: vi.fn(),
  canAccessProject: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    feature: { findMany: vi.fn() },
    featureDependency: { findMany: vi.fn() },
    phase: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveFeatureAccess, canAccessProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { UpdateFeatureCapability } = await import('@/lib/projects/capabilities/update-feature');

const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const canAccess = canAccessProject as ReturnType<typeof vi.fn>;
const featureFindMany = prisma.feature.findMany as ReturnType<typeof vi.fn>;
const depFindMany = prisma.featureDependency.findMany as ReturnType<typeof vi.fn>;
const phaseFindFirst = prisma.phase.findFirst as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new UpdateFeatureCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });
const granted = (status = 'in_flight', ownerUserId: string | null = USER) => ({
  ok: true,
  feature: { projectId: 'p1', ownerUserId, status, basis: 'member' },
});

const txFeatureUpdate = vi.fn();
const txDepDeleteMany = vi.fn();
const txDepCreateMany = vi.fn();
function mockTx() {
  txFeatureUpdate.mockResolvedValue({});
  txDepDeleteMany.mockResolvedValue({});
  txDepCreateMany.mockResolvedValue({});
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      feature: { update: txFeatureUpdate },
      featureDependency: { deleteMany: txDepDeleteMany, createMany: txDepCreateMany },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx();
  resolveFeature.mockResolvedValue(granted());
});

describe('update_feature guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ featureId: 'f1', title: 'x' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(resolveFeature).not.toHaveBeenCalled();
  });

  it('maps a non-member (funnel not_found) to not_found', async () => {
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

  it('errors nothing_to_update when no field is supplied', async () => {
    const r = await cap.execute({ featureId: 'f1' }, ctx());
    expect(r.error?.code).toBe('nothing_to_update');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('update_feature field patch', () => {
  it('updates only supplied fields, reports them, and audits', async () => {
    const r = await cap.execute(
      { featureId: 'f1', title: 'New', summary: 'short', description: null },
      ctx()
    );
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ featureId: 'f1', updated: ['title', 'summary', 'description'] });
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { title: 'New', summary: 'short', description: null },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'feature.update', entityId: 'f1' })
    );
  });

  it('sets references from an array and clears them to DbNull with null', async () => {
    await cap.execute(
      { featureId: 'f1', references: [{ label: 'spec', target: 'https://x/s' }] },
      ctx()
    );
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { references: [{ label: 'spec', target: 'https://x/s' }] },
    });

    vi.clearAllMocks();
    mockTx();
    resolveFeature.mockResolvedValue(granted());
    await cap.execute({ featureId: 'f1', references: null }, ctx());
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { references: Prisma.DbNull },
    });
  });
});

describe('update_feature ownership', () => {
  it('unclaims (ownerUserId null → planning), never un-shipping', async () => {
    resolveFeature.mockResolvedValue(granted('in_flight'));
    await cap.execute({ featureId: 'f1', ownerUserId: null }, ctx());
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { ownerUserId: null, status: 'planning' },
    });

    vi.clearAllMocks();
    mockTx();
    resolveFeature.mockResolvedValue(granted('shipped'));
    await cap.execute({ featureId: 'f1', ownerUserId: null }, ctx());
    // A shipped feature keeps its status when unclaimed.
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { ownerUserId: null },
    });
  });

  it('reassigns to a project member (planning → in_flight)', async () => {
    resolveFeature.mockResolvedValue(granted('planning', null));
    canAccess.mockResolvedValue({ basis: 'member' });
    await cap.execute({ featureId: 'f1', ownerUserId: 'user-2' }, ctx());
    expect(canAccess).toHaveBeenCalledWith('user-2', 'p1');
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { ownerUserId: 'user-2', status: 'in_flight' },
    });
  });

  it('rejects reassigning to a non-member (invalid_owner, no write)', async () => {
    canAccess.mockResolvedValue({ basis: null });
    const r = await cap.execute({ featureId: 'f1', ownerUserId: 'stranger' }, ctx());
    expect(r.error?.code).toBe('invalid_owner');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('update_feature phase assignment', () => {
  it('files the feature under a phase in the same project', async () => {
    phaseFindFirst.mockResolvedValue({ id: 'ph1' });
    const r = await cap.execute({ featureId: 'f1', phaseId: 'ph1' }, ctx());
    expect(r.data?.updated).toEqual(['phase']);
    expect(phaseFindFirst).toHaveBeenCalledWith({
      where: { id: 'ph1', projectId: 'p1' },
      select: { id: true },
    });
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { phase: { connect: { id: 'ph1' } } },
    });
  });

  it('unfiles the feature with phaseId null (no phase lookup)', async () => {
    const r = await cap.execute({ featureId: 'f1', phaseId: null }, ctx());
    expect(r.data?.updated).toEqual(['phase']);
    expect(phaseFindFirst).not.toHaveBeenCalled();
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { phase: { disconnect: true } },
    });
  });

  it('rejects a phase from another project (invalid_phase, no write)', async () => {
    phaseFindFirst.mockResolvedValue(null); // scoped lookup misses
    const r = await cap.execute({ featureId: 'f1', phaseId: 'other' }, ctx());
    expect(r.error?.code).toBe('invalid_phase');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('update_feature dependency edges', () => {
  it('replaces the edge set when the targets exist and stay acyclic', async () => {
    featureFindMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    depFindMany.mockResolvedValue([]); // no other edges in the project
    const r = await cap.execute(
      { featureId: 'f1', dependsOnFeatureIds: ['d1', 'd2', 'd1'] },
      ctx()
    );
    expect(r.data?.updated).toEqual(['dependencies']);
    // De-dupe → delete this feature's edges, then create the new set.
    expect(txDepDeleteMany).toHaveBeenCalledWith({ where: { featureId: 'f1' } });
    expect(txDepCreateMany).toHaveBeenCalledWith({
      data: [
        { featureId: 'f1', dependsOnFeatureId: 'd1' },
        { featureId: 'f1', dependsOnFeatureId: 'd2' },
      ],
    });
  });

  it('clears the edges when given an empty array (delete, no create)', async () => {
    depFindMany.mockResolvedValue([]);
    await cap.execute({ featureId: 'f1', dependsOnFeatureIds: [] }, ctx());
    expect(txDepDeleteMany).toHaveBeenCalledWith({ where: { featureId: 'f1' } });
    expect(txDepCreateMany).not.toHaveBeenCalled();
  });

  it('rejects a self-dependency (dependency_cycle, no write)', async () => {
    const r = await cap.execute({ featureId: 'f1', dependsOnFeatureIds: ['f1'] }, ctx());
    expect(r.error?.code).toBe('dependency_cycle');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects an edit that would create a cycle via existing edges (real assertAcyclic)', async () => {
    // Existing: d1 → f1. New: f1 → d1 ⇒ cycle f1 → d1 → f1.
    featureFindMany.mockResolvedValue([{ id: 'd1' }]);
    depFindMany.mockResolvedValue([{ featureId: 'd1', dependsOnFeatureId: 'f1' }]);
    const r = await cap.execute({ featureId: 'f1', dependsOnFeatureIds: ['d1'] }, ctx());
    expect(r.error?.code).toBe('dependency_cycle');
    expect(runTx).not.toHaveBeenCalled();
  });

  it('rejects a dependency not present in the project (invalid_dependency)', async () => {
    featureFindMany.mockResolvedValue([{ id: 'd1' }]); // only 1 of 2 found
    const r = await cap.execute({ featureId: 'f1', dependsOnFeatureIds: ['d1', 'd2'] }, ctx());
    expect(r.error?.code).toBe('invalid_dependency');
    expect(runTx).not.toHaveBeenCalled();
  });
});

describe('update_feature redactProvenance', () => {
  it('masks free-text fields, preserves the id + structural fields', () => {
    const out = cap.redactProvenance(
      {
        featureId: 'f1',
        title: 'secret title',
        summary: 'secret summary',
        description: null,
        references: [{ label: 'l', target: 't' }],
        dependsOnFeatureIds: ['d1'],
        ownerUserId: null,
        phaseId: 'ph1',
      },
      { success: true, data: { featureId: 'f1', updated: ['title'] } }
    );
    const a = out.args as Record<string, unknown>;
    expect(a.featureId).toBe('f1');
    expect(a.dependsOnFeatureIds).toEqual(['d1']);
    expect(a.ownerUserId).toBeNull();
    expect(a.phaseId).toBe('ph1'); // structural id preserved (not free text)
    expect(a.description).toBeNull(); // explicit clear preserved
    expect(String(a.title)).not.toContain('secret title');
    expect(String(a.summary)).not.toContain('secret summary');
    expect(String(a.references)).not.toContain('"label"');
  });
});
