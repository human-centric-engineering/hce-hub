/**
 * Tests for `lib/projects/capabilities/set-pr.ts` — the MCP `set_pr` verb
 * (f-github-sync §14 t-1). A thin wrapper over the `setTaskPr` core (tested in
 * task-actions.test.ts), so these cover only the capability seam: the URL
 * validation boundary, arg pass-through, the no-user guard, and the
 * NotFoundError → not_found mapping.
 */

import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/task-actions', () => ({ setTaskPr: vi.fn() }));

const { setTaskPr } = await import('@/lib/projects/task-actions');
const { NotFoundError } = await import('@/lib/api/errors');
const { SetPrCapability } = await import('@/lib/projects/capabilities/set-pr');

const setPr = setTaskPr as ReturnType<typeof vi.fn>;
const cap = new SetPrCapability();
const USER = 'user-1';
const PR = 'https://github.com/org/repo/pull/42';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

it('passes taskId + prUrl + projectId to the core and returns its (unchanged) status', async () => {
  setPr.mockResolvedValue({ taskId: 't1', status: 'claimed', warnings: [] });

  const r = await cap.execute({ taskId: 't1', prUrl: PR, projectId: 'p1' }, ctx());

  expect(setPr).toHaveBeenCalledWith(USER, 't1', PR, 'p1');
  expect(r.success).toBe(true);
  expect(r.data).toEqual({ taskId: 't1', status: 'claimed' });
});

it('rejects a non-http(s) URL at the Zod boundary (validate throws), without reaching the core', () => {
  // `validate()` runs before `execute()`; it throws on bad args so raw
  // LLM/user input never reaches the core.
  expect(() => cap.validate({ taskId: 't1', prUrl: 'javascript:alert(1)' })).toThrow();
  expect(setPr).not.toHaveBeenCalled();
});

it('rejects a malformed URL at the Zod boundary', () => {
  expect(() => cap.validate({ taskId: 't1', prUrl: 'not a url' })).toThrow();
  expect(setPr).not.toHaveBeenCalled();
});

it('accepts a well-formed https PR URL through validate', () => {
  expect(cap.validate({ taskId: 't1', prUrl: PR })).toEqual({ taskId: 't1', prUrl: PR });
});

it('maps the funnel NotFoundError to a not_found error (no enumeration)', async () => {
  setPr.mockRejectedValue(new NotFoundError('Task t1 not found'));

  const r = await cap.execute({ taskId: 't1', prUrl: PR }, ctx());

  expect(r.success).toBe(false);
  expect(r.error?.code).toBe('not_found');
});

it('errors no_user_context for a null-user run, without touching the core', async () => {
  const r = await cap.execute({ taskId: 't1', prUrl: PR }, ctx(null));

  expect(r.error?.code).toBe('no_user_context');
  expect(setPr).not.toHaveBeenCalled();
});

it('re-throws a non-NotFound fault (a real DB error is not swallowed)', async () => {
  setPr.mockRejectedValue(new Error('db exploded'));

  await expect(cap.execute({ taskId: 't1', prUrl: PR }, ctx())).rejects.toThrow('db exploded');
});
