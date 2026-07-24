/**
 * Tests for `lib/projects/capabilities/complete-task.ts` — the MCP `complete_task`
 * verb (f-status-model §20 t-38). A thin wrapper over the `completeTask` core
 * (tested in task-actions.test.ts): covers the capability seam only — arg
 * pass-through, the no-user guard, and the NotFoundError → not_found mapping.
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/task-actions', () => ({ completeTask: vi.fn() }));

const { completeTask } = await import('@/lib/projects/task-actions');
const { NotFoundError } = await import('@/lib/api/errors');
const { CompleteTaskCapability } = await import('@/lib/projects/capabilities/complete-task');

const complete = completeTask as ReturnType<typeof vi.fn>;
const cap = new CompleteTaskCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

it('passes taskId + projectId to the core and returns its result', async () => {
  const result = { taskId: 't1', status: 'merged', warnings: [] };
  complete.mockResolvedValue(result);

  const r = await cap.execute({ taskId: 't1', projectId: 'p1' }, ctx());

  expect(complete).toHaveBeenCalledWith(USER, 't1', 'p1');
  expect(r.success).toBe(true);
  expect(r.data).toEqual(result);
});

it('works without a projectId (undefined scope)', async () => {
  complete.mockResolvedValue({ taskId: 't1', status: 'merged', warnings: [] });

  await cap.execute({ taskId: 't1' }, ctx());

  expect(complete).toHaveBeenCalledWith(USER, 't1', undefined);
});

it('maps the funnel NotFoundError to a not_found error (no enumeration)', async () => {
  complete.mockRejectedValue(new NotFoundError('Task t1 not found'));

  const r = await cap.execute({ taskId: 't1' }, ctx());

  expect(r.success).toBe(false);
  expect(r.error?.code).toBe('not_found');
});

it('errors no_user_context for a null-user run, without touching the core', async () => {
  const r = await cap.execute({ taskId: 't1' }, ctx(null));

  expect(r.error?.code).toBe('no_user_context');
  expect(complete).not.toHaveBeenCalled();
});

it('re-throws a non-NotFound fault (a real DB error is not swallowed)', async () => {
  complete.mockRejectedValue(new Error('db exploded'));

  await expect(cap.execute({ taskId: 't1' }, ctx())).rejects.toThrow('db exploded');
});
