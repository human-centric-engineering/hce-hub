/**
 * Tests for `lib/projects/capture-idea-service.ts` — the parking-gesture core
 * (f-idea-capture §22-03 t-58). Pins the membership funnel (deny ≡ NotFoundError),
 * the no-parked-phase guard (ValidationError, no write), and the transactional
 * create of an unowned/indicative stub filed into the parked phase + the
 * `feature_created` journal tagged `captured` + audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ canAccessProject: vi.fn() }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { phase: { findFirst: vi.fn() } },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));

const { canAccessProject } = await import('@/lib/projects/access');
const { executeTransaction } = await import('@/lib/db/utils');
const { prisma } = await import('@/lib/db/client');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { NotFoundError, ValidationError } = await import('@/lib/api/errors');
const { captureIdea } = await import('@/lib/projects/capture-idea-service');

const access = canAccessProject as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const phaseFindFirst = prisma.phase.findFirst as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;

const USER = 'user-1';

const txProjectUpdate = vi.fn();
const txFeatureCreate = vi.fn();
function mockTx(featureId = 'f-new', nextNumber = 7) {
  txProjectUpdate.mockResolvedValue({ featureCounter: nextNumber });
  txFeatureCreate.mockResolvedValue({ id: featureId });
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  runTx.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
    cb({ project: { update: txProjectUpdate }, feature: { create: txFeatureCreate } })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx();
  access.mockResolvedValue({ ok: true, basis: 'member' });
  phaseFindFirst.mockResolvedValue({ id: 'park1' });
});

describe('captureIdea', () => {
  it('throws NotFoundError for a non-member / unknown project (no write)', async () => {
    access.mockResolvedValue({ ok: false, basis: null });
    await expect(captureIdea(USER, 'p1', 'an idea')).rejects.toBeInstanceOf(NotFoundError);
    expect(phaseFindFirst).not.toHaveBeenCalled();
    expect(runTx).not.toHaveBeenCalled();
  });

  it('throws ValidationError when the project has no parked phase (no write)', async () => {
    phaseFindFirst.mockResolvedValue(null);
    await expect(captureIdea(USER, 'p1', 'an idea')).rejects.toBeInstanceOf(ValidationError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('targets the project’s parked phase (first by ordinal)', async () => {
    await captureIdea(USER, 'p1', 'an idea');
    expect(phaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', status: 'parked' },
        orderBy: [{ ordinal: 'asc' }, { createdAt: 'asc' }],
      })
    );
  });

  it('creates an unowned indicative stub filed in the park, journals captured + audits', async () => {
    const r = await captureIdea(USER, 'p1', 'board merged column: cap 5/person');

    expect(r).toEqual({ featureId: 'f-new', phaseId: 'park1' });
    // Counter bumped for a stable §N, then the stub created into the park.
    expect(txFeatureCreate).toHaveBeenCalledWith({
      data: {
        projectId: 'p1',
        number: 7,
        title: 'board merged column: cap 5/person',
        status: 'planning',
        planningStage: 'indicative',
        ownerUserId: null,
        phaseId: 'park1',
      },
      select: { id: true },
    });
    // Journalled as a feature creation, tagged `captured` (no new event kind).
    expect(emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        featureId: 'f-new',
        kind: 'feature_created',
        actorUserId: USER,
        metadata: { captured: true, phaseId: 'park1' },
      })
    );
    // Atomicity: the event uses the same tx client that created the feature.
    expect(emit.mock.calls[0][0].feature.create).toBe(txFeatureCreate);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'idea.capture', entityId: 'f-new' })
    );
  });
});
