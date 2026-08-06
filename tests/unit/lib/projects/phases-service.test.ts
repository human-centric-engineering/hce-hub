/**
 * Tests for `lib/projects/phases-service.ts` (f-phases §22 t1) — the shared
 * create/update-phase core both the MCP capabilities and t3's REST routes call.
 * Pins the membership funnel (non-member / unknown → NotFoundError), the append
 * ordinal default, the status→timestamp derivation, the partial patch, the
 * idempotent re-stamp guard, and the nothing_to_update ValidationError.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

vi.mock('@/lib/projects/access', () => ({ canAccessProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    phase: { findUnique: vi.fn(), update: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  },
}));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { canAccessProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { createPhase, updatePhase } = await import('@/lib/projects/phases-service');

const canAccess = canAccessProject as ReturnType<typeof vi.fn>;
const phaseFindUnique = prisma.phase.findUnique as ReturnType<typeof vi.fn>;
const phaseUpdate = prisma.phase.update as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const USER = 'user-1';

// The tx handle the create path drives (aggregate for the append ordinal + create).
const txAggregate = vi.fn();
const txCreate = vi.fn();
function mockTx() {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ phase: { aggregate: txAggregate, create: txCreate } })
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
    const r = await updatePhase(USER, 'ph1', { name: 'Renamed', ordinal: 3 });
    expect(r).toEqual({ phaseId: 'ph1', updated: ['name', 'ordinal'] });
    expect(phaseUpdate).toHaveBeenCalledWith({
      where: { id: 'ph1' },
      data: { name: 'Renamed', ordinal: 3 },
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

  it('stamps completedAt the first time status becomes complete', async () => {
    await updatePhase(USER, 'ph1', { status: 'complete' });
    const data = phaseUpdate.mock.calls[0][0].data;
    expect(data.completedAt).toBeInstanceOf(Date);
  });
});
