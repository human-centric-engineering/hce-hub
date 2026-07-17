/**
 * Unit: `getProjectEvents` — the membership-scoped journal read (f-journal §17 t-3).
 *
 * Covers the funnel gate (deny ≡ 404 propagates), scope/kind filtering into the
 * query, the three batched enrichments (actor / feature / task), graceful nulls
 * for a deleted feature/task or erased actor, and the ISO date shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    projectEvent: { findMany: vi.fn() },
    feature: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/projects/access', () => ({ getAccessibleProject: vi.fn() }));
vi.mock('@/lib/projects/user-refs', () => ({ fetchUsers: vi.fn() }));

const { prisma } = await import('@/lib/db/client');
const { getAccessibleProject } = await import('@/lib/projects/access');
const { fetchUsers } = await import('@/lib/projects/user-refs');
const { NotFoundError } = await import('@/lib/api/errors');
const { getProjectEvents } = await import('@/lib/projects/journal');

const eventFindMany = prisma.projectEvent.findMany as ReturnType<typeof vi.fn>;
const featureFindMany = prisma.feature.findMany as ReturnType<typeof vi.fn>;
const taskFindMany = prisma.task.findMany as ReturnType<typeof vi.fn>;
const accessible = getAccessibleProject as ReturnType<typeof vi.fn>;
const users = fetchUsers as ReturnType<typeof vi.fn>;

const USER = 'user-1';
const PROJECT = 'p1';
const AT = new Date('2026-07-17T10:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  accessible.mockResolvedValue({ id: PROJECT });
  eventFindMany.mockResolvedValue([]);
  featureFindMany.mockResolvedValue([]);
  taskFindMany.mockResolvedValue([]);
  users.mockResolvedValue(new Map());
});

describe('getProjectEvents access + scoping', () => {
  it('propagates the funnel 404 for a non-member and never queries events', async () => {
    accessible.mockRejectedValue(new NotFoundError('Project not found'));
    await expect(getProjectEvents(USER, PROJECT)).rejects.toBeInstanceOf(NotFoundError);
    expect(eventFindMany).not.toHaveBeenCalled();
  });

  it('scopes the query to the project and applies taskId / featureId / kinds filters', async () => {
    await getProjectEvents(USER, PROJECT, {
      taskId: 't1',
      featureId: 'f1',
      kinds: ['decision', 'note'],
    });
    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: PROJECT,
          taskId: 't1',
          featureId: 'f1',
          kind: { in: ['decision', 'note'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    );
  });

  it('omits absent filters (project scope only)', async () => {
    await getProjectEvents(USER, PROJECT);
    expect(eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT } })
    );
  });

  it('does not run feature/task lookups when no events reference them', async () => {
    eventFindMany.mockResolvedValue([
      {
        id: 'e1',
        kind: 'note',
        actorUserId: null,
        actorAgentId: null,
        featureId: null,
        taskId: null,
        title: null,
        body: 'x',
        metadata: null,
        createdAt: AT,
      },
    ]);
    await getProjectEvents(USER, PROJECT);
    expect(featureFindMany).not.toHaveBeenCalled();
    expect(taskFindMany).not.toHaveBeenCalled();
  });
});

describe('getProjectEvents enrichment', () => {
  it('resolves actor / feature / task refs and ISO-formats the date', async () => {
    eventFindMany.mockResolvedValue([
      {
        id: 'e1',
        kind: 'task_created',
        actorUserId: USER,
        actorAgentId: null,
        featureId: 'f1',
        taskId: 't1',
        title: null,
        body: null,
        metadata: { status: 'available' },
        createdAt: AT,
      },
    ]);
    users.mockResolvedValue(
      new Map([[USER, { id: USER, name: 'Simon', email: 's@x', image: null }]])
    );
    featureFindMany.mockResolvedValue([{ id: 'f1', slug: 'f-journal', title: 'Journal' }]);
    taskFindMany.mockResolvedValue([{ id: 't1', number: 5 }]);

    const [ev] = await getProjectEvents(USER, PROJECT);
    expect(ev).toEqual({
      id: 'e1',
      kind: 'task_created',
      actor: { id: USER, name: 'Simon', email: 's@x', image: null },
      actorAgentId: null,
      feature: { id: 'f1', slug: 'f-journal', title: 'Journal' },
      task: { id: 't1', number: 5 },
      title: null,
      body: null,
      metadata: { status: 'available' },
      createdAt: '2026-07-17T10:00:00.000Z',
    });
  });

  it('nulls a deleted feature/task and an erased actor (retained history)', async () => {
    eventFindMany.mockResolvedValue([
      {
        id: 'e2',
        kind: 'task_claimed',
        actorUserId: 'gone',
        actorAgentId: null,
        featureId: 'deleted-f',
        taskId: 'deleted-t',
        title: null,
        body: null,
        metadata: null,
        createdAt: AT,
      },
    ]);
    users.mockResolvedValue(new Map()); // actor erased
    featureFindMany.mockResolvedValue([]); // feature deleted
    taskFindMany.mockResolvedValue([]); // task deleted

    const [ev] = await getProjectEvents(USER, PROJECT);
    expect(ev.actor).toBeNull();
    expect(ev.feature).toBeNull();
    expect(ev.task).toBeNull();
  });
});
