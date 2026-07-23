/**
 * Unit: `getTaskDetail` — the single-task detail read (f-task-sheet t-1).
 *
 * Load-bearing assertions:
 *   - membership is the funnel's — `getAccessibleProject` deny → 404-not-403;
 *   - the task is loaded **scoped to the project** — a task in another project
 *     (a cross-project id-swap) is 404, and the access funnel runs first;
 *   - effective status is `computeEffectiveStatus` (deps-blocked available →
 *     blocked), for the task and for each dependency neighbour;
 *   - the two-way dep graph splits correctly: `dependencies.dependsOn` → blockedBy,
 *     `dependents.task` → blocks;
 *   - nullable refs (erased claimer / owner) resolve to `null`, never deref;
 *   - `prUrl` is returned raw (sanitized at render, per house pattern).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    task: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { getTaskDetail } = await import('@/lib/projects/task-detail');

const getAccessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const taskFindFirst = prisma.task.findFirst as ReturnType<typeof vi.fn>;
const userFindMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

/** A dependency-graph neighbour (blocker or dependent). */
const neighbour = (o: {
  id: string;
  number?: number | null;
  status?: string;
  slug?: string | null;
  deps?: string[];
}) => ({
  id: o.id,
  number: o.number ?? null,
  title: o.id,
  status: o.status ?? 'claimed',
  claimedByUserId: null,
  feature: { slug: o.slug ?? null },
  dependencies: (o.deps ?? []).map((s) => ({ dependsOn: { status: s } })),
});

/** The main task row `findFirst` returns. */
const taskRow = (o: Record<string, unknown> = {}) => ({
  id: 't1',
  number: 1,
  title: 'Do the thing',
  description: 'desc',
  status: 'claimed',
  prUrl: null,
  filesScope: [],
  claimedByUserId: null,
  feature: { id: 'f1', slug: 'f-mcp', title: 'Feature one', ownerUserId: null },
  dependencies: [],
  dependents: [],
  ...o,
});

const userRow = (id: string) => ({ id, name: id.toUpperCase(), email: `${id}@x.io`, image: null });

beforeEach(() => {
  vi.clearAllMocks();
  getAccessible.mockResolvedValue({ id: 'p1' });
  userFindMany.mockResolvedValue([]);
});

describe('getTaskDetail', () => {
  it('404s a non-member / unknown project via the funnel, before loading the task', async () => {
    getAccessible.mockRejectedValue(new NotFoundError('Project not found'));
    await expect(getTaskDetail('u1', 'p1', 't1')).rejects.toBeInstanceOf(NotFoundError);
    expect(taskFindFirst).not.toHaveBeenCalled();
  });

  it('404s a task that does not exist / lives in another project (cross-project id-swap)', async () => {
    taskFindFirst.mockResolvedValue(null); // scoped `feature.projectId` filtered it out
    await expect(getTaskDetail('u1', 'p1', 'tX')).rejects.toBeInstanceOf(NotFoundError);
    // The query is scoped to the accessible project.
    expect(taskFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tX', feature: { projectId: 'p1' } } })
    );
  });

  it('returns real content (description + file scope) and raw prUrl', async () => {
    taskFindFirst.mockResolvedValue(
      taskRow({
        description: 'implement the widget',
        filesScope: ['lib/a.ts', 'lib/b.ts'],
        prUrl: 'javascript:alert(1)', // returned RAW — the component sanitizes
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.description).toBe('implement the widget');
    expect(detail.filesScope).toEqual(['lib/a.ts', 'lib/b.ts']);
    expect(detail.prUrl).toBe('javascript:alert(1)');
  });

  it('computes the task effective status (deps-blocked claimed → blocked)', async () => {
    taskFindFirst.mockResolvedValue(
      taskRow({
        status: 'claimed',
        dependencies: [{ dependsOn: neighbour({ id: 'b1', status: 'active' }) }], // dep not merged
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.status).toBe('blocked');
  });

  it('splits the dependency graph: dependencies → blockedBy, dependents → blocks, each with effective status', async () => {
    taskFindFirst.mockResolvedValue(
      taskRow({
        dependencies: [
          { dependsOn: neighbour({ id: 'b1', number: 2, slug: 'f-a', status: 'merged' }) },
        ],
        dependents: [
          {
            // a dependent that is itself deps-blocked → effective 'blocked'
            task: neighbour({ id: 'd1', number: 3, status: 'claimed', deps: ['claimed'] }),
          },
        ],
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.blockedBy).toEqual([
      { id: 'b1', number: 2, title: 'b1', featureSlug: 'f-a', status: 'merged' },
    ]);
    expect(detail.blocks).toEqual([
      { id: 'd1', number: 3, title: 'd1', featureSlug: null, status: 'blocked' },
    ]);
  });

  it('resolves claimer + owner, marks isMine, and never derefs a null/erased ref', async () => {
    // owner o1 exists; claimer u1 (the caller) exists; a second task-less case covered elsewhere
    userFindMany.mockResolvedValue([userRow('u1'), userRow('o1')]);
    taskFindFirst.mockResolvedValue(
      taskRow({
        claimedByUserId: 'u1',
        feature: { id: 'f1', slug: 'f-mcp', title: 'Feature one', ownerUserId: 'o1' },
      })
    );
    const detail = await getTaskDetail('u1', 'p1', 't1');
    expect(detail.claimer?.id).toBe('u1');
    expect(detail.isMine).toBe(true);
    expect(detail.feature.owner?.id).toBe('o1');
  });

  it('renders an erased claimant / unowned feature as null (not a crash)', async () => {
    // claimant id present but the user row is gone (erased) → null, not undefined deref
    userFindMany.mockResolvedValue([]);
    taskFindFirst.mockResolvedValue(
      taskRow({
        claimedByUserId: 'ghost',
        feature: { id: 'f1', slug: null, title: 'Feature one', ownerUserId: null },
      })
    );
    const detail = await getTaskDetail('u2', 'p1', 't1');
    expect(detail.claimer).toBeNull();
    expect(detail.isMine).toBe(false);
    expect(detail.feature.owner).toBeNull();
  });
});
