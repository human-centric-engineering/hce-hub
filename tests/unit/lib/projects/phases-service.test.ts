/**
 * Tests for `lib/projects/phases-service.ts` (f-phases §22 t1) — the shared
 * create/update-phase core both the MCP capabilities and t3's REST routes call.
 * Pins the membership funnel (non-member / unknown → NotFoundError), the append
 * ordinal default, the status→timestamp derivation, the partial patch, the
 * idempotent re-stamp guard, and the nothing_to_update ValidationError.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

vi.mock('@/lib/projects/access', () => ({
  canAccessProject: vi.fn(),
  resolveFeatureAccess: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    phase: {
      findUnique: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    feature: { update: vi.fn() },
  },
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { canAccessProject, resolveFeatureAccess } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { createPhase, updatePhase, reorderPhases, assignFeatureToPhase } =
  await import('@/lib/projects/phases-service');

const canAccess = canAccessProject as ReturnType<typeof vi.fn>;
const resolveFeature = resolveFeatureAccess as ReturnType<typeof vi.fn>;
const phaseFindUnique = prisma.phase.findUnique as ReturnType<typeof vi.fn>;
const phaseUpdate = prisma.phase.update as ReturnType<typeof vi.fn>;
const phaseFindMany = prisma.phase.findMany as ReturnType<typeof vi.fn>;
const phaseFindFirst = prisma.phase.findFirst as ReturnType<typeof vi.fn>;
const featureUpdate = prisma.feature.update as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const USER = 'user-1';

// The tx handle drives create (aggregate + create) and reorder (per-phase update).
const txAggregate = vi.fn();
const txCreate = vi.fn();
const txPhaseUpdate = vi.fn();
function mockTx() {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      phase: {
        aggregate: txAggregate,
        create: txCreate,
        update: txPhaseUpdate,
        findMany: phaseFindMany,
      },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx();
  canAccess.mockResolvedValue({ basis: 'member' });
});

describe('createPhase', () => {
  it('throws NotFoundError for a non-member (no enumeration)', async () => {
    canAccess.mockResolvedValue({ basis: null });
    await expect(createPhase(USER, 'p1', { name: 'Alpha' })).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('appends after the last phase when no ordinal is given (max + 1)', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: 4 } });
    txCreate.mockResolvedValue({ id: 'ph-new', ordinal: 5 });
    const r = await createPhase(USER, 'p1', { name: 'Alpha' });
    expect(r).toEqual({ phaseId: 'ph-new', ordinal: 5 });
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'p1', name: 'Alpha', ordinal: 5 }),
      })
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'phase.create' }));
  });

  it('uses ordinal 0 for the first phase in an empty project', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: null } });
    txCreate.mockResolvedValue({ id: 'ph-0', ordinal: 0 });
    await createPhase(USER, 'p1', { name: 'First' });
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ordinal: 0 }) })
    );
  });

  it('honours an explicit ordinal without aggregating', async () => {
    txCreate.mockResolvedValue({ id: 'ph-2', ordinal: 2 });
    await createPhase(USER, 'p1', { name: 'Mid', ordinal: 2 });
    expect(txAggregate).not.toHaveBeenCalled();
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ordinal: 2 }) })
    );
  });

  it('defaults status to upcoming with no lifecycle timestamps', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: null } });
    txCreate.mockResolvedValue({ id: 'ph', ordinal: 0 });
    await createPhase(USER, 'p1', { name: 'X' });
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'upcoming', startedAt: null, completedAt: null }),
      })
    );
  });

  it('stamps startedAt when created active', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: null } });
    txCreate.mockResolvedValue({ id: 'ph', ordinal: 0 });
    await createPhase(USER, 'p1', { name: 'Live', status: 'active' });
    const arg = txCreate.mock.calls[0][0].data;
    expect(arg.startedAt).toBeInstanceOf(Date);
    expect(arg.completedAt).toBeNull();
  });

  it('stamps BOTH startedAt and completedAt when created complete (never null-start)', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: null } });
    txCreate.mockResolvedValue({ id: 'ph', ordinal: 0 });
    await createPhase(USER, 'p1', { name: 'Done', status: 'complete' });
    const arg = txCreate.mock.calls[0][0].data;
    expect(arg.startedAt).toBeInstanceOf(Date);
    expect(arg.completedAt).toBeInstanceOf(Date);
  });
});

describe('updatePhase', () => {
  beforeEach(() => {
    phaseFindUnique.mockResolvedValue({
      projectId: 'p1',
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    phaseUpdate.mockResolvedValue({});
  });

  it('throws NotFoundError for an unknown phase', async () => {
    phaseFindUnique.mockResolvedValue(null);
    await expect(updatePhase(USER, 'ghost', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for a non-member (phase in a hidden project)', async () => {
    canAccess.mockResolvedValue({ basis: null });
    await expect(updatePhase(USER, 'ph1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(phaseUpdate).not.toHaveBeenCalled();
  });

  it('throws ValidationError when no field is supplied', async () => {
    await expect(updatePhase(USER, 'ph1', {})).rejects.toBeInstanceOf(ValidationError);
    expect(phaseUpdate).not.toHaveBeenCalled();
  });

  it('patches only supplied fields and reports them', async () => {
    const r = await updatePhase(USER, 'ph1', { name: 'Renamed', description: 'why' });
    expect(r).toEqual({ phaseId: 'ph1', updated: ['name', 'description'] });
    expect(phaseUpdate).toHaveBeenCalledWith({
      where: { id: 'ph1' },
      data: { name: 'Renamed', description: 'why' },
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'phase.update' }));
  });

  it('clears the description with null', async () => {
    await updatePhase(USER, 'ph1', { description: null });
    expect(phaseUpdate).toHaveBeenCalledWith({
      where: { id: 'ph1' },
      data: { description: null },
    });
  });

  it('stamps startedAt the first time status becomes active', async () => {
    await updatePhase(USER, 'ph1', { status: 'active' });
    const data = phaseUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('active');
    expect(data.startedAt).toBeInstanceOf(Date);
  });

  it('does not re-stamp startedAt when already active', async () => {
    phaseFindUnique.mockResolvedValue({
      projectId: 'p1',
      status: 'active',
      startedAt: new Date('2026-01-01'),
      completedAt: null,
    });
    await updatePhase(USER, 'ph1', { status: 'active' });
    const data = phaseUpdate.mock.calls[0][0].data;
    expect(data.startedAt).toBeUndefined(); // not re-written
  });

  it('stamps completedAt (and a missing startedAt) when status becomes complete', async () => {
    // upcoming (never active) → complete must not leave an impossible null-start.
    await updatePhase(USER, 'ph1', { status: 'complete' });
    const data = phaseUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.startedAt).toBeInstanceOf(Date); // back-fills the start it skipped
  });

  it('preserves an existing startedAt when completing an already-started phase', async () => {
    const started = new Date('2026-02-01');
    phaseFindUnique.mockResolvedValue({
      projectId: 'p1',
      status: 'active',
      startedAt: started,
      completedAt: null,
    });
    await updatePhase(USER, 'ph1', { status: 'complete' });
    const data = phaseUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.startedAt).toBeUndefined(); // kept, not overwritten
  });

  it('clears completedAt when a completed phase is reopened (no stale "done")', async () => {
    phaseFindUnique.mockResolvedValue({
      projectId: 'p1',
      status: 'complete',
      startedAt: new Date('2026-02-01'),
      completedAt: new Date('2026-03-01'),
    });
    await updatePhase(USER, 'ph1', { status: 'active' });
    const data = phaseUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('active');
    expect(data.completedAt).toBeNull(); // reopened → done stamp dropped
    expect(data.startedAt).toBeUndefined(); // already started, kept
  });

  it('drops completedAt when a completed phase is parked', async () => {
    phaseFindUnique.mockResolvedValue({
      projectId: 'p1',
      status: 'complete',
      startedAt: new Date('2026-02-01'),
      completedAt: new Date('2026-03-01'),
    });
    await updatePhase(USER, 'ph1', { status: 'parked' });
    const data = phaseUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeNull();
  });

  it('rejects a cross-project id-swap when expectedProjectId is given (404, no write)', async () => {
    phaseFindUnique.mockResolvedValue({
      projectId: 'other',
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    await expect(updatePhase(USER, 'ph1', { name: 'x' }, 'p1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(phaseUpdate).not.toHaveBeenCalled();
  });
});

describe('reorderPhases (f-phases §22 t3)', () => {
  it('throws NotFoundError for a non-member', async () => {
    canAccess.mockResolvedValue({ basis: null });
    await expect(reorderPhases(USER, 'p1', ['a', 'b'])).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('reassigns ordinals 0..n-1 in the given order, in a transaction', async () => {
    phaseFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const r = await reorderPhases(USER, 'p1', ['c', 'a', 'b']);
    expect(r).toEqual({ projectId: 'p1', count: 3 });
    expect(txPhaseUpdate).toHaveBeenNthCalledWith(1, { where: { id: 'c' }, data: { ordinal: 0 } });
    expect(txPhaseUpdate).toHaveBeenNthCalledWith(2, { where: { id: 'a' }, data: { ordinal: 1 } });
    expect(txPhaseUpdate).toHaveBeenNthCalledWith(3, { where: { id: 'b' }, data: { ordinal: 2 } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'phase.reorder' }));
  });

  it('rejects an incomplete list (must be exactly the project’s phases), no ordinal write', async () => {
    // Completeness is now checked INSIDE the tx (against a consistent snapshot), so
    // the tx runs but no ordinal update happens before it throws.
    phaseFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await expect(reorderPhases(USER, 'p1', ['a', 'b'])).rejects.toBeInstanceOf(ValidationError);
    expect(txPhaseUpdate).not.toHaveBeenCalled();
  });

  it('rejects a list containing a stranger id, no ordinal write', async () => {
    phaseFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await expect(reorderPhases(USER, 'p1', ['a', 'zzz'])).rejects.toBeInstanceOf(ValidationError);
    expect(txPhaseUpdate).not.toHaveBeenCalled();
  });
});

describe('assignFeatureToPhase (f-phases §22 t3)', () => {
  const granted = (projectId = 'p1') => ({ ok: true, feature: { projectId, basis: 'member' } });

  beforeEach(() => {
    resolveFeature.mockResolvedValue(granted());
    featureUpdate.mockResolvedValue({});
  });

  it('is member-tier — resolves at the member tier, not owner', async () => {
    phaseFindFirst.mockResolvedValue({ id: 'ph1' });
    await assignFeatureToPhase(USER, 'f1', 'ph1');
    expect(resolveFeature).toHaveBeenCalledWith(USER, 'f1', 'member');
  });

  it('files a feature under a same-project phase (connect)', async () => {
    phaseFindFirst.mockResolvedValue({ id: 'ph1' });
    const r = await assignFeatureToPhase(USER, 'f1', 'ph1');
    expect(r).toEqual({ featureId: 'f1', phaseId: 'ph1' });
    expect(featureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { phase: { connect: { id: 'ph1' } } },
    });
  });

  it('unfiles with phaseId null (disconnect, no phase lookup)', async () => {
    const r = await assignFeatureToPhase(USER, 'f1', null);
    expect(r.phaseId).toBeNull();
    expect(phaseFindFirst).not.toHaveBeenCalled();
    expect(featureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { phase: { disconnect: true } },
    });
  });

  it('rejects a phase from another project (ValidationError, no write)', async () => {
    phaseFindFirst.mockResolvedValue(null);
    await expect(assignFeatureToPhase(USER, 'f1', 'other')).rejects.toBeInstanceOf(ValidationError);
    expect(featureUpdate).not.toHaveBeenCalled();
  });

  it('maps a non-member (funnel not_found) to NotFoundError', async () => {
    resolveFeature.mockResolvedValue({ ok: false, reason: 'not_found' });
    await expect(assignFeatureToPhase(USER, 'f1', 'ph1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a cross-project id-swap via expectedProjectId', async () => {
    resolveFeature.mockResolvedValue(granted('other'));
    await expect(assignFeatureToPhase(USER, 'f1', null, 'p1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(featureUpdate).not.toHaveBeenCalled();
  });
});
