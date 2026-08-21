/**
 * Tests for `lib/projects/capabilities/withdraw-task.ts` — the MCP `withdraw_task`
 * verb (f-authoring-fidelity §21 t-123). A thin wrapper over the `withdrawTask` core
 * (tested in task-actions.test.ts), so this covers the capability seam only: arg
 * pass-through, the ambient-scope fallback, the three error mappings, and the
 * provenance redaction.
 *
 * The error mappings are the reason this file exists. They are pure branch code that
 * nothing else reaches — the core throws, and only this layer decides what an agent
 * is told. An untested mapping is indistinguishable from a missing one, and the
 * difference between `not_found` and `forbidden` here is an anti-enumeration
 * guarantee, not a nicety.
 */

import { it, expect, vi, beforeEach, describe } from 'vitest';

vi.mock('@/lib/projects/task-actions', () => ({ withdrawTask: vi.fn() }));

const { withdrawTask } = await import('@/lib/projects/task-actions');
const { NotFoundError, ValidationError, ForbiddenError } = await import('@/lib/api/errors');
const { WithdrawTaskCapability } = await import('@/lib/projects/capabilities/withdraw-task');

const withdraw = withdrawTask as ReturnType<typeof vi.fn>;
const cap = new WithdrawTaskCapability();
const USER = 'user-1';
const ctx = (over: Record<string, unknown> = {}) => ({ userId: USER, agentId: 'a1', ...over });
const OK = { taskId: 't1', number: 42, withdrawn: true, affectedDependents: [] };

beforeEach(() => {
  vi.clearAllMocks();
  withdraw.mockResolvedValue(OK);
});

describe('argument pass-through', () => {
  it('forwards reason and restore, and returns the core result verbatim', async () => {
    const r = await cap.execute(
      { taskId: 't1', reason: 'duplicate of t-88', restore: true, projectId: 'p1' },
      ctx()
    );

    expect(withdraw).toHaveBeenCalledWith(USER, 't1', {
      restore: true,
      reason: 'duplicate of t-88',
      expectedProjectId: 'p1',
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual(OK);
  });

  it('falls back to the ambient project scope when no projectId is given', async () => {
    // On a project-scoped MCP key the projectId is ambient, and the id-swap guard
    // should still apply — dropping to `undefined` here would silently widen the
    // verb to any project the caller can see.
    await cap.execute({ taskId: 't1' }, ctx({ scope: { projectId: 'ambient-p' } }));
    expect(withdraw).toHaveBeenCalledWith(
      USER,
      't1',
      expect.objectContaining({ expectedProjectId: 'ambient-p' })
    );
  });

  it('prefers an explicit projectId over the ambient one', async () => {
    await cap.execute(
      { taskId: 't1', projectId: 'explicit-p' },
      ctx({ scope: { projectId: 'ambient-p' } })
    );
    expect(withdraw).toHaveBeenCalledWith(
      USER,
      't1',
      expect.objectContaining({ expectedProjectId: 'explicit-p' })
    );
  });

  it('refuses without a signed-in caller, before touching the core', async () => {
    const r = await cap.execute({ taskId: 't1' }, ctx({ userId: null }));
    expect(r.error?.code).toBe('no_user_context');
    expect(withdraw).not.toHaveBeenCalled();
  });
});

describe('error mapping', () => {
  it('maps NotFoundError to not_found, echoing the id and nothing else', async () => {
    withdraw.mockRejectedValue(new NotFoundError('Task t1 not found'));
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('not_found');
  });

  it('maps ForbiddenError to forbidden — NOT not_found', async () => {
    // The pair is load-bearing: a non-member must not learn the task exists, while a
    // colleague who simply isn't the owner must be told why rather than sent to hunt
    // a 404. Collapsing both to not_found would be the safe-looking wrong answer.
    withdraw.mockRejectedValue(new ForbiddenError('nope'));
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.error?.code).toBe('forbidden');
  });

  it('maps the merged refusal to already_merged, keeping the core message', async () => {
    withdraw.mockRejectedValue(
      new ValidationError('A merged task cannot be withdrawn — it has already landed.')
    );
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.error?.code).toBe('already_merged');
    expect(r.error?.message).toContain('already landed');
  });

  it('lets an unexpected error escape rather than reporting a tidy failure', async () => {
    // A swallowed infrastructure error would surface to the agent as a normal
    // refusal, which is the worst kind of lie this layer could tell.
    withdraw.mockRejectedValue(new Error('connection reset'));
    await expect(cap.execute({ taskId: 't1' }, ctx())).rejects.toThrow('connection reset');
  });
});

describe('provenance redaction', () => {
  it('records the reason as a length, never its text', async () => {
    // The durable call log is not project-scoped; a reason can name a person.
    const { args } = cap.redactProvenance(
      { taskId: 't1', reason: 'raised by a named customer', restore: false, projectId: 'p1' },
      { success: true, data: OK }
    );
    const serialised = JSON.stringify(args);
    expect(serialised).not.toContain('named customer');
    expect(serialised).toContain('26 chars');
  });

  it('records a null reason rather than a redaction placeholder when there is none', async () => {
    const { args } = cap.redactProvenance({ taskId: 't1' }, { success: true, data: OK });
    expect((args as { reason: unknown }).reason).toBeNull();
  });

  it('declares that it processes PII, because the reason is free text', () => {
    expect(cap.processesPii).toBe(true);
  });
});
