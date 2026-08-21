/**
 * Tests for `lib/projects/tasks.ts` — the tasks read (f-task-reads §30 t-67). Pins
 * the funnel (deny propagates as NotFoundError, no read), the where-scoping (project
 * + optional feature/kind), the shared effective-status computation (deps-blocked
 * `claimed` → `blocked`), the post-compute `status` filter, and the DTO projection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { task: { findMany: vi.fn() } } }));

const { getAccessibleProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { NotFoundError } = await import('@/lib/api/errors');
const { getProjectTasks } = await import('@/lib/projects/tasks');

const access = getAccessibleProject as ReturnType<typeof vi.fn>;
const findMany = prisma.task.findMany as ReturnType<typeof vi.fn>;

const USER = 'user-1';

/** A DB row shaped like the `select` in getProjectTasks. */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 't1',
    number: 1,
    title: 'Do the thing',
    featureId: 'f1',
    status: 'claimed',
    kind: 'feature_work',
    prUrl: null,
    assigneeUserId: 'u2',
    feature: { slug: 'f-a', title: 'Feature A' },
    withdrawnAt: null,
    dependencies: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ id: 'p1' });
  findMany.mockResolvedValue([]);
});

describe('getProjectTasks', () => {
  it('propagates the funnel NotFoundError for a non-member / unknown project (no read)', async () => {
    access.mockRejectedValue(new NotFoundError('nope'));
    await expect(getProjectTasks(USER, 'p1')).rejects.toBeInstanceOf(NotFoundError);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes to the project, ordered feature-then-task, with no filter where-clauses by default', async () => {
    await getProjectTasks(USER, 'p1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feature: { projectId: 'p1' } },
        orderBy: [{ feature: { createdAt: 'asc' } }, { createdAt: 'asc' }],
      })
    );
  });

  it('adds featureId + kind as where-clauses when given', async () => {
    await getProjectTasks(USER, 'p1', { featureId: 'f9', kind: 'bug' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { feature: { projectId: 'p1' }, featureId: 'f9', kind: 'bug' },
      })
    );
  });

  it('projects rows to the DTO and computes effective status (deps-blocked claimed → blocked)', async () => {
    findMany.mockResolvedValue([
      row({ id: 'ready', status: 'claimed', dependencies: [{ dependsOn: { status: 'merged' } }] }),
      row({
        id: 'blocked',
        status: 'claimed',
        dependencies: [{ dependsOn: { status: 'active' } }],
      }),
    ]);
    const { projectId, tasks } = await getProjectTasks(USER, 'p1');
    expect(projectId).toBe('p1');
    expect(tasks.map((t) => [t.id, t.status])).toEqual([
      ['ready', 'claimed'],
      ['blocked', 'blocked'],
    ]);
    // Full projection for one row.
    expect(tasks[0]).toEqual({
      id: 'ready',
      number: 1,
      title: 'Do the thing',
      featureId: 'f1',
      featureSlug: 'f-a',
      featureTitle: 'Feature A',
      status: 'claimed',
      kind: 'feature_work',
      assigneeUserId: 'u2',
      prUrl: null,
    });
  });

  it('applies the status filter AFTER computing effective status (so `blocked` is filterable)', async () => {
    findMany.mockResolvedValue([
      row({ id: 'ready', status: 'claimed', dependencies: [{ dependsOn: { status: 'merged' } }] }),
      row({
        id: 'blocked',
        status: 'claimed',
        dependencies: [{ dependsOn: { status: 'active' } }],
      }),
    ]);
    const { tasks } = await getProjectTasks(USER, 'p1', { status: 'blocked' });
    expect(tasks.map((t) => t.id)).toEqual(['blocked']);
  });

  /**
   * Withdrawn work (§21 t-123). This read is the ONLY one that can still see it —
   * the Plan, Board, feature page and `next_task` all drop it in the query — which
   * is what keeps a withdrawal reversible: you cannot restore a task you can no
   * longer name.
   */
  describe('withdrawn tasks', () => {
    const mixed = () => [
      row({ id: 'live', status: 'claimed' }),
      row({ id: 'gone', status: 'claimed', withdrawnAt: new Date('2026-08-21') }),
    ];

    it('hides withdrawn work from an unfiltered read', async () => {
      findMany.mockResolvedValue(mixed());
      const { tasks } = await getProjectTasks(USER, 'p1');
      expect(tasks.map((t) => t.id)).toEqual(['live']);
    });

    it('hides it from a read filtered to another status, rather than leaking it in', async () => {
      // The subtle one: the withdrawn row's STORED status is `claimed`, so a filter
      // keyed on the stored value would return it. The filter runs on the effective
      // status, where it reads `withdrawn` and matches nothing.
      findMany.mockResolvedValue(mixed());
      const { tasks } = await getProjectTasks(USER, 'p1', { status: 'claimed' });
      expect(tasks.map((t) => t.id)).toEqual(['live']);
    });

    it('returns ONLY withdrawn work when that is what you asked for', async () => {
      findMany.mockResolvedValue(mixed());
      const { tasks } = await getProjectTasks(USER, 'p1', { status: 'withdrawn' });
      expect(tasks.map((t) => t.id)).toEqual(['gone']);
      expect(tasks[0].status).toBe('withdrawn');
    });

    it('does not filter withdrawn work at the DB — the query must still return it', async () => {
      // If the exclusion moved into the `where`, `status: 'withdrawn'` would return
      // nothing and the restore path would have no way to find its subject.
      findMany.mockResolvedValue([]);
      await getProjectTasks(USER, 'p1', { status: 'withdrawn' });
      expect(findMany.mock.calls[0][0].where).not.toHaveProperty('withdrawnAt');
    });
  });
});
