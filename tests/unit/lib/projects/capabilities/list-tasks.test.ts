/**
 * Tests for `lib/projects/capabilities/list-tasks.ts` — the tasks read over MCP
 * (f-task-reads §30 t-67). Pins the no-user guard, the funnel 404 map (deny ≡
 * not_found via the reused `getProjectTasks`), the forwarded caller + filters, and
 * the projection passthrough.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/tasks', () => ({ getProjectTasks: vi.fn() }));

const { getProjectTasks } = await import('@/lib/projects/tasks');
const { NotFoundError } = await import('@/lib/api/errors');
const { ListTasksCapability } = await import('@/lib/projects/capabilities/list-tasks');

const getTasks = getProjectTasks as ReturnType<typeof vi.fn>;
const cap = new ListTasksCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

describe('list_tasks', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({ projectId: 'p1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getTasks).not.toHaveBeenCalled();
  });

  it('maps the funnel NotFoundError to not_found (no enumeration)', async () => {
    getTasks.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('re-throws a non-funnel error rather than masking it as not_found', async () => {
    getTasks.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ projectId: 'p1' }, ctx())).rejects.toThrow('db down');
  });

  it('forwards the caller + projectId + filters to the membership-scoped read', async () => {
    getTasks.mockResolvedValue({ projectId: 'p1', tasks: [] });
    await cap.execute(
      { projectId: 'p1', featureId: 'f9', kind: 'bug', status: 'active' },
      ctx('caller')
    );
    expect(getTasks).toHaveBeenCalledWith('caller', 'p1', {
      featureId: 'f9',
      kind: 'bug',
      status: 'active',
    });
  });

  it('returns the read result unchanged (projectId + task refs)', async () => {
    const tasks = [
      {
        id: 't1',
        number: 67,
        title: 'list_tasks verb',
        featureId: 'f30',
        featureSlug: 'f-task-reads',
        featureTitle: 'Read a feature tasks over MCP',
        status: 'active',
        kind: 'feature_work',
        assigneeUserId: 'u2',
        prUrl: null,
      },
    ];
    getTasks.mockResolvedValue({ projectId: 'p1', tasks });
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ projectId: 'p1', tasks });
  });

  it('validate rejects an unknown status / kind (enum-guarded before execute)', () => {
    expect(() => cap.validate({ projectId: 'p1', status: 'done' })).toThrow();
    expect(() => cap.validate({ projectId: 'p1', kind: 'chore' })).toThrow();
    // A valid narrow passes through.
    expect(cap.validate({ projectId: 'p1', kind: 'bug', status: 'blocked' })).toMatchObject({
      kind: 'bug',
      status: 'blocked',
    });
  });
});
