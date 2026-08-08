/**
 * Tests for `lib/projects/capabilities/assign-task.ts` — a thin wrapper over the
 * shared `assignTask` core (covered in task-actions.test). Pins the capability's
 * own responsibilities: the no-user guard, error mapping (funnel `not_found`,
 * assignee `invalid_assignee`), and forwarding the caller + project scope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/task-actions', () => ({ assignTask: vi.fn() }));

const { assignTask } = await import('@/lib/projects/task-actions');
const { NotFoundError, ValidationError } = await import('@/lib/api/errors');
const { AssignTaskCapability } = await import('@/lib/projects/capabilities/assign-task');

const assign = assignTask as ReturnType<typeof vi.fn>;
const cap = new AssignTaskCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

describe('assign_task capability', () => {
  it('errors no_user_context for a null-user run, without calling the core', async () => {
    const r = await cap.execute({ taskId: 't1', assigneeUserId: 'u2' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(assign).not.toHaveBeenCalled();
  });

  it('maps a funnel NotFoundError to not_found', async () => {
    assign.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ taskId: 't1', assigneeUserId: 'u2' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('maps a ValidationError (assignee not a member) to invalid_assignee', async () => {
    assign.mockRejectedValue(new ValidationError('The assignee must be a member of this project.'));
    const r = await cap.execute({ taskId: 't1', assigneeUserId: 'stranger' }, ctx());
    expect(r.error?.code).toBe('invalid_assignee');
  });

  it('returns taskId + status on success, forwarding the caller + project scope', async () => {
    assign.mockResolvedValue({ taskId: 't1', status: 'claimed', warnings: [] });
    const r = await cap.execute(
      { taskId: 't1', assigneeUserId: 'u2', projectId: 'p1' },
      ctx('caller')
    );
    expect(r).toEqual({ success: true, data: { taskId: 't1', status: 'claimed' } });
    expect(assign).toHaveBeenCalledWith('caller', 't1', 'u2', 'p1');
  });
});
