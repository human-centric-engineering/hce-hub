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
const phaseFindMany = prisma.phase.findMany as ReturnType<typeof vi.fn>;
const phaseFindFirst = prisma.phase.findFirst as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const USER = 'user-1';

/**
 * Point BOTH phase reads at the same row — the pre-transaction one (access, 404,
 * lifecycle timestamps) and the in-transaction one §33 t-98 added to decide what
 * actually changed. Same row ⇒ nobody wrote in between, which is the normal case;
 * a test simulates a concurrent writer by overriding `txPhaseFindUnique` after.
 */
function setPhaseRow(row: {
  projectId: string;
  name: string;
  description: string | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  phaseFindUnique.mockResolvedValue(row);
  txPhaseFindUnique.mockResolvedValue({
    name: row.name,
    description: row.description,
    status: row.status,
  });
}

// The tx handle drives create (aggregate + create) and reorder (per-phase update).
const txAggregate = vi.fn();
const txCreate = vi.fn();
const txPhaseUpdate = vi.fn();
// §33 t-98 re-reads the row INSIDE the transaction to decide what actually
// changed, so the fake tx answers it with the same values as the pre-tx read.
const txPhaseFindUnique = vi.fn();
const txIdeaUpdateMany = vi.fn();
// §33 t-98 journals inside the same transaction as the write, and `updatePhase`
// / `assignFeatureToPhase` became transactional for that reason — so the fake tx
// now has to answer the feature reads and the event write too.
const txEventCreate = vi.fn();
const txFeatureUpdate = vi.fn();
const txFeatureFindUnique = vi.fn();
function mockTx() {
  txIdeaUpdateMany.mockResolvedValue({ count: 1 });
  txEventCreate.mockResolvedValue({ id: 'evt-1' });
  txFeatureUpdate.mockResolvedValue({});
  txFeatureFindUnique.mockResolvedValue({ phase: null }); // unfiled unless a test says so
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      phase: {
        aggregate: txAggregate,
        create: txCreate,
        update: txPhaseUpdate,
        findUnique: txPhaseFindUnique,
        findMany: phaseFindMany,
      },
      idea: { updateMany: txIdeaUpdateMany },
      feature: { update: txFeatureUpdate, findUnique: txFeatureFindUnique },
      projectEvent: { create: txEventCreate },
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

  it('promotes an idea into the phase (fromIdeaId): resolves it in the same tx, audits it', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: null } });
    txCreate.mockResolvedValue({ id: 'ph-new', ordinal: 0 });
    await createPhase(USER, 'p1', { name: 'Ideas Wave', fromIdeaId: 'idea-1' });
    // Guarded on status:'open', kind 'phase', linked to the created phase.
    expect(txIdeaUpdateMany).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1', status: 'open' },
      data: {
        status: 'promoted',
        promotedKind: 'phase',
        promotedRefId: 'ph-new',
        triagedAt: expect.any(Date),
      },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ fromIdeaId: 'idea-1' }) })
    );
  });

  it('does not touch ideas when no fromIdeaId is given', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: null } });
    txCreate.mockResolvedValue({ id: 'ph', ordinal: 0 });
    await createPhase(USER, 'p1', { name: 'X' });
    expect(txIdeaUpdateMany).not.toHaveBeenCalled();
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
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    txPhaseUpdate.mockResolvedValue({});
  });

  it('throws NotFoundError for an unknown phase', async () => {
    phaseFindUnique.mockResolvedValue(null);
    await expect(updatePhase(USER, 'ghost', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for a non-member (phase in a hidden project)', async () => {
    canAccess.mockResolvedValue({ basis: null });
    await expect(updatePhase(USER, 'ph1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(txPhaseUpdate).not.toHaveBeenCalled();
  });

  it('throws ValidationError when no field is supplied', async () => {
    await expect(updatePhase(USER, 'ph1', {})).rejects.toBeInstanceOf(ValidationError);
    expect(txPhaseUpdate).not.toHaveBeenCalled();
  });

  it('patches only supplied fields and reports them', async () => {
    const r = await updatePhase(USER, 'ph1', { name: 'Renamed', description: 'why' });
    expect(r).toEqual({ phaseId: 'ph1', updated: ['name', 'description'] });
    expect(txPhaseUpdate).toHaveBeenCalledWith({
      where: { id: 'ph1' },
      data: { name: 'Renamed', description: 'why' },
    });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'phase.update' }));
  });

  it('clears the description with null', async () => {
    await updatePhase(USER, 'ph1', { description: null });
    expect(txPhaseUpdate).toHaveBeenCalledWith({
      where: { id: 'ph1' },
      data: { description: null },
    });
  });

  it('stamps startedAt the first time status becomes active', async () => {
    await updatePhase(USER, 'ph1', { status: 'active' });
    const data = txPhaseUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('active');
    expect(data.startedAt).toBeInstanceOf(Date);
  });

  it('does not re-stamp startedAt when already active', async () => {
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'active',
      startedAt: new Date('2026-01-01'),
      completedAt: null,
    });
    await updatePhase(USER, 'ph1', { status: 'active' });
    const data = txPhaseUpdate.mock.calls[0][0].data;
    expect(data.startedAt).toBeUndefined(); // not re-written
  });

  it('stamps completedAt (and a missing startedAt) when status becomes complete', async () => {
    // upcoming (never active) → complete must not leave an impossible null-start.
    await updatePhase(USER, 'ph1', { status: 'complete' });
    const data = txPhaseUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.startedAt).toBeInstanceOf(Date); // back-fills the start it skipped
  });

  it('preserves an existing startedAt when completing an already-started phase', async () => {
    const started = new Date('2026-02-01');
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'active',
      startedAt: started,
      completedAt: null,
    });
    await updatePhase(USER, 'ph1', { status: 'complete' });
    const data = txPhaseUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.startedAt).toBeUndefined(); // kept, not overwritten
  });

  it('clears completedAt when a completed phase is reopened (no stale "done")', async () => {
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'complete',
      startedAt: new Date('2026-02-01'),
      completedAt: new Date('2026-03-01'),
    });
    await updatePhase(USER, 'ph1', { status: 'active' });
    const data = txPhaseUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('active');
    expect(data.completedAt).toBeNull(); // reopened → done stamp dropped
    expect(data.startedAt).toBeUndefined(); // already started, kept
  });

  it('drops completedAt when a completed phase is parked', async () => {
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'complete',
      startedAt: new Date('2026-02-01'),
      completedAt: new Date('2026-03-01'),
    });
    await updatePhase(USER, 'ph1', { status: 'parked' });
    const data = txPhaseUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeNull();
  });

  it('rejects a cross-project id-swap when expectedProjectId is given (404, no write)', async () => {
    setPhaseRow({
      projectId: 'other',
      name: 'Foundations',
      description: null,
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    await expect(updatePhase(USER, 'ph1', { name: 'x' }, 'p1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(txPhaseUpdate).not.toHaveBeenCalled();
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
    txFeatureUpdate.mockResolvedValue({});
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
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { phase: { connect: { id: 'ph1' } } },
    });
  });

  it('unfiles with phaseId null (disconnect, no phase lookup)', async () => {
    const r = await assignFeatureToPhase(USER, 'f1', null);
    expect(r.phaseId).toBeNull();
    expect(phaseFindFirst).not.toHaveBeenCalled();
    expect(txFeatureUpdate).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { phase: { disconnect: true } },
    });
  });

  it('rejects a phase from another project (ValidationError, no write)', async () => {
    phaseFindFirst.mockResolvedValue(null);
    await expect(assignFeatureToPhase(USER, 'f1', 'other')).rejects.toBeInstanceOf(ValidationError);
    expect(txFeatureUpdate).not.toHaveBeenCalled();
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
    expect(txFeatureUpdate).not.toHaveBeenCalled();
  });
});

describe('phase journalling (f-phase-history §33 t-98)', () => {
  it('appends phase_created in the same transaction as the phase', async () => {
    txAggregate.mockResolvedValue({ _max: { ordinal: null } });
    txCreate.mockResolvedValue({ id: 'ph-new', ordinal: 0 });
    await createPhase(USER, 'p1', { name: 'Foundations' });
    expect(txEventCreate).toHaveBeenCalledTimes(1);
    const data = txEventCreate.mock.calls[0][0].data;
    expect(data.kind).toBe('phase_created');
    expect(data.phaseId).toBe('ph-new');
    expect(data.actorUserId).toBe(USER);
  });

  it('appends phase_updated naming the fields that actually changed', async () => {
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    txPhaseUpdate.mockResolvedValue({});
    await updatePhase(USER, 'ph1', { name: 'Project flow', status: 'active' });
    const data = txEventCreate.mock.calls[0][0].data;
    expect(data.kind).toBe('phase_updated');
    expect(data.phaseId).toBe('ph1');
    expect(data.metadata).toEqual({
      fields: ['name', 'status'],
      name: 'Project flow',
      status: 'active',
    });
  });

  it('records only what CHANGED, not what was merely supplied', async () => {
    // An idempotent `update_phase({status:'active'})` on an already-active phase is
    // a legitimate call (a retry, a "make sure it's active" step). Journalling it
    // would put a change in the history that never happened — the same rule the
    // membership emitter applies to a no-op re-file.
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: 'Why this exists',
      status: 'active',
      startedAt: new Date('2026-01-01'),
      completedAt: null,
    });
    txPhaseUpdate.mockResolvedValue({});
    const r = await updatePhase(USER, 'ph1', { status: 'active', name: 'Foundations' });
    // The patch is still applied and still REPORTED as supplied (API contract)…
    expect(r.updated).toEqual(['name', 'status']);
    expect(txPhaseUpdate).toHaveBeenCalled();
    // …but nothing actually changed, so the journal stays silent.
    expect(txEventCreate).not.toHaveBeenCalled();
  });

  it('records a partial change when only one supplied field actually differs', async () => {
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    txPhaseUpdate.mockResolvedValue({});
    await updatePhase(USER, 'ph1', { name: 'Foundations', status: 'active' });
    expect(txEventCreate.mock.calls[0][0].data.metadata).toMatchObject({ fields: ['status'] });
  });

  it('always snapshots the phase name, even on a status-only edit', async () => {
    // A phase_updated event has no feature/task ref to chip, so without the name
    // the Log reads "set the phase to complete" with no way to tell which phase.
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    txPhaseUpdate.mockResolvedValue({});
    await updatePhase(USER, 'ph1', { status: 'complete' });
    expect(txEventCreate.mock.calls[0][0].data.metadata).toEqual({
      fields: ['status'],
      name: 'Foundations',
      status: 'complete',
    });
  });

  it('treats clearing an already-null description as no change', async () => {
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'upcoming',
      startedAt: null,
      completedAt: null,
    });
    txPhaseUpdate.mockResolvedValue({});
    await updatePhase(USER, 'ph1', { description: null });
    expect(txEventCreate).not.toHaveBeenCalled();
  });

  it('records the phase a feature actually came from, read inside the transaction', async () => {
    // The `from` value must be the one this write overwrote — so it is read from
    // the tx handle, not carried in from the earlier access resolve.
    phaseFindFirst.mockResolvedValue({ id: 'ph2', name: 'Project flow' });
    txFeatureFindUnique.mockResolvedValue({ phase: { id: 'ph1', name: 'Foundations' } });
    await assignFeatureToPhase(USER, 'f1', 'ph2');
    const data = txEventCreate.mock.calls[0][0].data;
    expect(data.kind).toBe('phase_membership_changed');
    expect(data.phaseId).toBe('ph2'); // hangs on the destination
    expect(data.metadata).toMatchObject({
      subject: 'feature',
      fromPhaseId: 'ph1',
      fromPhaseName: 'Foundations',
      toPhaseId: 'ph2',
    });
  });

  it('records nothing when a feature is re-filed under the phase it is already in', async () => {
    phaseFindFirst.mockResolvedValue({ id: 'ph1', name: 'Foundations' });
    txFeatureFindUnique.mockResolvedValue({ phase: { id: 'ph1', name: 'Foundations' } });
    await assignFeatureToPhase(USER, 'f1', 'ph1');
    expect(txFeatureUpdate).toHaveBeenCalled(); // the write is still idempotently applied
    expect(txEventCreate).not.toHaveBeenCalled(); // …but nothing happened to record
  });

  it('compares against the row as it is INSIDE the transaction, not before it', async () => {
    // Concurrency: A renames Foundations → Sunrise Mgmt and commits; B's
    // update_phase({name:'Sunrise Mgmt'}) had already read "Foundations" before
    // the transaction. Comparing against that pre-transaction snapshot would make
    // B journal a rename that never happened.
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'active',
      startedAt: null,
      completedAt: null,
    });
    txPhaseFindUnique.mockResolvedValue({
      name: 'Sunrise Mgmt', // A's rename landed first, AFTER the pre-tx read
      description: null,
      status: 'active',
    });
    txPhaseUpdate.mockResolvedValue({});
    await updatePhase(USER, 'ph1', { name: 'Sunrise Mgmt' });
    expect(txEventCreate).not.toHaveBeenCalled();
  });

  it('omits status from metadata when the edit did not change it', async () => {
    // Asserting a status the edit never touched is the same lie `fields` prevents.
    setPhaseRow({
      projectId: 'p1',
      name: 'Foundations',
      description: null,
      status: 'active',
      startedAt: null,
      completedAt: null,
    });
    txPhaseUpdate.mockResolvedValue({});
    await updatePhase(USER, 'ph1', { description: 'why this exists', status: 'active' });
    expect(txEventCreate.mock.calls[0][0].data.metadata).toEqual({
      fields: ['description'],
      name: 'Foundations',
    });
  });

  it('does NOT journal a reorder — ordering is presentation, not history', async () => {
    // One drag would otherwise emit an event per phase and bury the real changes.
    phaseFindMany.mockResolvedValue([{ id: 'ph1' }, { id: 'ph2' }]);
    txPhaseUpdate.mockResolvedValue({});
    await reorderPhases(USER, 'p1', ['ph2', 'ph1']);
    expect(txPhaseUpdate).toHaveBeenCalledTimes(2);
    expect(txEventCreate).not.toHaveBeenCalled();
  });
});
