/**
 * Unit: `listProjectPhases` — the phase list read (f-phases §22 t2). Pins the
 * membership funnel (getAccessibleProject deny → NotFoundError propagates, 404
 * not 403), the ordinal-then-createdAt ordering passed to the query, and the
 * feature-count projection.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { phase: { findMany: vi.fn() } } }));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { listProjectPhases } = await import('@/lib/projects/phases');

const getAccessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const phaseFindMany = prisma.phase.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getAccessible.mockResolvedValue({ id: 'p1', slug: 'hce-hub' });
});

describe('listProjectPhases', () => {
  it('propagates NotFoundError from the funnel (→ 404, never 403)', async () => {
    getAccessible.mockRejectedValue(new NotFoundError('Project p1 not found'));
    await expect(listProjectPhases('u1', 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(phaseFindMany).not.toHaveBeenCalled();
  });

  it('orders by ordinal then createdAt and scopes to the project', async () => {
    phaseFindMany.mockResolvedValue([]);
    await listProjectPhases('u1', 'p1');
    expect(getAccessible).toHaveBeenCalledWith('u1', 'p1');
    expect(phaseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1' },
        orderBy: [{ ordinal: 'asc' }, { createdAt: 'asc' }],
      })
    );
  });

  it('maps rows to views with the feature count', async () => {
    phaseFindMany.mockResolvedValue([
      {
        id: 'ph1',
        name: 'v0.9.0',
        description: 'release band',
        status: 'active',
        ordinal: 0,
        startedAt: new Date('2026-08-01T00:00:00.000Z'),
        completedAt: null,
        _count: { features: 3 },
      },
      {
        id: 'ph2',
        name: 'Ideas',
        description: null,
        status: 'parked',
        ordinal: 1,
        startedAt: null,
        completedAt: null,
        _count: { features: 0 },
      },
    ]);
    const phases = await listProjectPhases('u1', 'p1');
    expect(phases).toEqual([
      {
        id: 'ph1',
        name: 'v0.9.0',
        description: 'release band',
        status: 'active',
        ordinal: 0,
        // Serialised to ISO at the boundary so the client mirrors it without a Date.
        startedAt: '2026-08-01T00:00:00.000Z',
        completedAt: null,
        featureCount: 3,
      },
      {
        id: 'ph2',
        name: 'Ideas',
        description: null,
        status: 'parked',
        ordinal: 1,
        startedAt: null,
        completedAt: null,
        featureCount: 0,
      },
    ]);
  });
});
