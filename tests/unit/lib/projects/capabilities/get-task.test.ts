/**
 * Tests for `lib/projects/capabilities/get-task.ts` — the task-detail read over MCP
 * (f-task-reads §30 t-68). Pins the no-user guard, the projectId derivation (via
 * resolveTaskAccess when omitted) vs the passed guard, the funnel 404 map (deny ≡
 * not_found via both resolveTaskAccess and the reused getTaskDetail), the projection
 * down to the agent-facing shape (raw assigneeUserId, no UserRefs/members), and the
 * provenance masking of the free-text body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/task-detail', () => ({ getTaskDetail: vi.fn() }));
vi.mock('@/lib/projects/access', () => ({ resolveTaskAccess: vi.fn() }));

const { getTaskDetail } = await import('@/lib/projects/task-detail');
const { resolveTaskAccess } = await import('@/lib/projects/access');
const { NotFoundError } = await import('@/lib/api/errors');
const { GetTaskCapability } = await import('@/lib/projects/capabilities/get-task');

const getDetail = getTaskDetail as ReturnType<typeof vi.fn>;
const resolveTask = resolveTaskAccess as ReturnType<typeof vi.fn>;
const cap = new GetTaskCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

/** A full TaskDetail (what getTaskDetail returns) — richer than get_task's output. */
function detail(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    number: 65,
    title: 'Replace the synthetic project id',
    description: 'Change the chubproject id to a real cuid.',
    doneWhen: 'The project id is a cuid; all FKs cascade.',
    status: 'active',
    kind: 'bug',
    prUrl: null,
    filesScope: ['scripts/'],
    claimer: { id: 'u2', name: 'Bo', email: 'b@x.io', image: null },
    assignee: { id: 'u2', name: 'Bo', email: 'b@x.io', image: null },
    isMine: false,
    members: [{ id: 'u2', name: 'Bo', email: 'b@x.io', image: null }],
    feature: { id: 'f1', slug: 'f-selfhost-cutover', title: 'Self-host cutover', owner: null },
    blockedBy: [
      { id: 'd1', number: 40, title: 'dep', featureSlug: 'f-x', status: 'merged' as const },
    ],
    blocks: [
      { id: 'd2', number: 70, title: 'downstream', featureSlug: 'f-y', status: 'claimed' as const },
    ],
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('get_task', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({ taskId: 't1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getDetail).not.toHaveBeenCalled();
    expect(resolveTask).not.toHaveBeenCalled();
  });

  it('uses the passed projectId directly (id-swap guard) without deriving it', async () => {
    getDetail.mockResolvedValue(detail());
    await cap.execute({ taskId: 't1', projectId: 'p1' }, ctx('caller'));
    expect(resolveTask).not.toHaveBeenCalled();
    expect(getDetail).toHaveBeenCalledWith('caller', 'p1', 't1');
  });

  it('derives projectId from the task (via resolveTaskAccess) when omitted', async () => {
    resolveTask.mockResolvedValue({ ok: true, task: { projectId: 'p9' } });
    getDetail.mockResolvedValue(detail());
    await cap.execute({ taskId: 't1' }, ctx('caller'));
    expect(resolveTask).toHaveBeenCalledWith('caller', 't1');
    expect(getDetail).toHaveBeenCalledWith('caller', 'p9', 't1');
  });

  it('maps a resolveTaskAccess deny to not_found (no projectId given)', async () => {
    resolveTask.mockResolvedValue({ ok: false, reason: 'not_found' });
    const r = await cap.execute({ taskId: 't1' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(getDetail).not.toHaveBeenCalled();
  });

  it('maps a getTaskDetail NotFoundError to not_found (cross-project / unknown task)', async () => {
    getDetail.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ taskId: 't1', projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('re-throws a non-funnel error rather than masking it as not_found', async () => {
    getDetail.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ taskId: 't1', projectId: 'p1' }, ctx())).rejects.toThrow('db down');
  });

  it('projects the detail down to the agent shape (raw assignee id, no UserRefs/members/isMine)', async () => {
    getDetail.mockResolvedValue(detail());
    const r = await cap.execute({ taskId: 't1', projectId: 'p1' }, ctx());
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      id: 't1',
      number: 65,
      title: 'Replace the synthetic project id',
      description: 'Change the chubproject id to a real cuid.',
      doneWhen: 'The project id is a cuid; all FKs cascade.',
      status: 'active',
      kind: 'bug',
      filesScope: ['scripts/'],
      prUrl: null,
      assigneeUserId: 'u2', // the assignee's raw id, not the UserRef
      feature: { id: 'f1', slug: 'f-selfhost-cutover', title: 'Self-host cutover' },
      blockedBy: [{ id: 'd1', number: 40, title: 'dep', featureSlug: 'f-x', status: 'merged' }],
      blocks: [
        { id: 'd2', number: 70, title: 'downstream', featureSlug: 'f-y', status: 'claimed' },
      ],
    });
  });

  it('renders a null assignee as null (no UserRef leak)', async () => {
    getDetail.mockResolvedValue(detail({ assignee: null }));
    const r = await cap.execute({ taskId: 't1', projectId: 'p1' }, ctx());
    expect(r.data?.assigneeUserId).toBeNull();
  });

  it('masks the free-text body in provenance, keeping the task id', async () => {
    // Use the real projected result (from execute) so the redaction is tested against
    // the actual shape the LLM would get.
    getDetail.mockResolvedValue(detail());
    const result = await cap.execute({ taskId: 't1', projectId: 'p1' }, ctx());
    const redacted = cap.redactProvenance({ taskId: 't1', projectId: 'p1' }, result);
    expect(redacted.args).toEqual({ taskId: 't1', projectId: 'p1' });
    expect(redacted.resultPreview).not.toContain('chubproject'); // the body is not persisted verbatim
    expect(redacted.resultPreview).toContain('t-65'); // just the ref
  });
});
