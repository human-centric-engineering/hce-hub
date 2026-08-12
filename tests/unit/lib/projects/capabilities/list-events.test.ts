/**
 * Tests for `lib/projects/capabilities/list-events.ts` — the journal read over MCP
 * (f-mcp-project-scope §31 t-70). Pins the no-user guard, the project_required guard,
 * the optional feature/task scoping forwarded to getProjectEvents, the funnel 404 map,
 * the projection (raw actorUserId, no UserRef leak), and the provenance masking of the
 * authored bodies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/journal', () => ({ getProjectEvents: vi.fn() }));

const { getProjectEvents } = await import('@/lib/projects/journal');
const { NotFoundError } = await import('@/lib/api/errors');
const { ListEventsCapability } = await import('@/lib/projects/capabilities/list-events');

const getEvents = getProjectEvents as ReturnType<typeof vi.fn>;
const cap = new ListEventsCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

/** A ProjectEventView (what getProjectEvents returns). */
function event(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    kind: 'decision',
    actor: { id: 'u2', name: 'Bo', email: 'b@x.io', image: null },
    actorAgentId: null,
    feature: { id: 'f1', slug: 'f-mcp', title: 'MCP scope' },
    task: null,
    title: 'A hard project boundary',
    body: 'We chose hard isolation because a leaked key should be worth one project.',
    metadata: { tag: 'architecture' },
    createdAt: '2026-08-12T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('list_events', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({}, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getEvents).not.toHaveBeenCalled();
  });

  it('errors project_required when no projectId is ambient or passed', async () => {
    const r = await cap.execute({}, ctx());
    expect(r.error?.code).toBe('project_required');
    expect(getEvents).not.toHaveBeenCalled();
  });

  it('reads the whole journal when no feature/task scope is given', async () => {
    getEvents.mockResolvedValue([event()]);
    await cap.execute({ projectId: 'p1' }, ctx('caller'));
    expect(getEvents).toHaveBeenCalledWith('caller', 'p1', {});
  });

  it('forwards featureId / taskId scoping to getProjectEvents', async () => {
    getEvents.mockResolvedValue([]);
    await cap.execute({ projectId: 'p1', featureId: 'f1', taskId: 't1' }, ctx('caller'));
    expect(getEvents).toHaveBeenCalledWith('caller', 'p1', { featureId: 'f1', taskId: 't1' });
  });

  it('maps a getProjectEvents NotFoundError to not_found', async () => {
    getEvents.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('re-throws a non-funnel error rather than masking it', async () => {
    getEvents.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ projectId: 'p1' }, ctx())).rejects.toThrow('db down');
  });

  it('projects each event to the agent shape (raw actorUserId, no UserRef leak)', async () => {
    getEvents.mockResolvedValue([event()]);
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.data?.events).toEqual([
      {
        id: 'e1',
        kind: 'decision',
        actorUserId: 'u2', // the actor's raw id, not the UserRef (no name/email)
        actorAgentId: null,
        feature: { id: 'f1', slug: 'f-mcp', title: 'MCP scope' },
        task: null,
        title: 'A hard project boundary',
        body: 'We chose hard isolation because a leaked key should be worth one project.',
        metadata: { tag: 'architecture' },
        createdAt: '2026-08-12T00:00:00.000Z',
      },
    ]);
  });

  it('renders a null actor as null (agent / system / erased)', async () => {
    getEvents.mockResolvedValue([event({ actor: null, actorAgentId: 'agent-9' })]);
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.data?.events[0].actorUserId).toBeNull();
    expect(r.data?.events[0].actorAgentId).toBe('agent-9');
  });

  it('masks the authored bodies in provenance, keeping the scope ids', async () => {
    getEvents.mockResolvedValue([event()]);
    const result = await cap.execute({ projectId: 'p1', featureId: 'f1' }, ctx());
    const redacted = cap.redactProvenance({ projectId: 'p1', featureId: 'f1' }, result);
    expect(redacted.args).toEqual({ projectId: 'p1', featureId: 'f1', taskId: null });
    expect(redacted.resultPreview).not.toContain('hard isolation'); // bodies not persisted verbatim
    expect(redacted.resultPreview).toContain('1 event');
  });
});
