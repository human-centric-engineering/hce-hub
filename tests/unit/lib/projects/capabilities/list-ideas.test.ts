/**
 * Tests for `lib/projects/capabilities/list-ideas.ts` — the idea-inbox read over
 * MCP (f-idea-capture §22 t-63). Pins the no-user guard, the funnel 404 map (deny
 * ≡ not_found via the reused `getProjectIdeas`), the projection down to the light
 * {number,id,status,text} shape (dropping author/dates), the forwarded caller +
 * projectId, and — because the jots are personal data — that provenance masks the
 * returned texts while keeping the project scope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/ideas', () => ({ getProjectIdeas: vi.fn() }));

const { getProjectIdeas } = await import('@/lib/projects/ideas');
const { NotFoundError } = await import('@/lib/api/errors');
const { ListIdeasCapability } = await import('@/lib/projects/capabilities/list-ideas');

const getIdeas = getProjectIdeas as ReturnType<typeof vi.fn>;
const cap = new ListIdeasCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

describe('list_ideas', () => {
  it('errors no_user_context for a null-user run, without reading', async () => {
    const r = await cap.execute({ projectId: 'p1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(getIdeas).not.toHaveBeenCalled();
  });

  it('maps the funnel NotFoundError to not_found (no enumeration)', async () => {
    getIdeas.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('re-throws a non-funnel error rather than masking it as not_found', async () => {
    getIdeas.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ projectId: 'p1' }, ctx())).rejects.toThrow('db down');
  });

  it('forwards the caller + projectId to the membership-scoped read', async () => {
    getIdeas.mockResolvedValue({ ideas: [] });
    await cap.execute({ projectId: 'p1' }, ctx('caller'));
    expect(getIdeas).toHaveBeenCalledWith('caller', 'p1');
  });

  it('projects the inbox down to {number,id,status,text}, dropping author + dates', async () => {
    getIdeas.mockResolvedValue({
      ideas: [
        {
          id: 'i1',
          number: 4,
          text: 'the board should remember my last filter',
          status: 'open',
          // Heavy inbox fields (author, dates) must NOT leak into the agent-facing read.
          createdBy: { id: 'u1', name: 'Ada', email: 'ada@x.io', image: null },
          createdAt: '2026-08-01T10:00:00.000Z',
          triagedAt: null,
        },
        {
          id: 'i2',
          number: 2,
          text: 'archived thought',
          status: 'dropped',
          createdBy: null,
          createdAt: '2026-08-02T00:00:00.000Z',
          triagedAt: '2026-08-03T00:00:00.000Z',
        },
      ],
    });

    const r = await cap.execute({ projectId: 'p1' }, ctx());

    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      projectId: 'p1',
      ideas: [
        { number: 4, id: 'i1', status: 'open', text: 'the board should remember my last filter' },
        { number: 2, id: 'i2', status: 'dropped', text: 'archived thought' },
      ],
    });
  });

  it('masks the returned jots in provenance, keeping the project scope', () => {
    const result = {
      success: true as const,
      data: {
        projectId: 'p1',
        ideas: [
          { number: 4, id: 'i1', status: 'open' as const, text: 'a sensitive idea about someone' },
        ],
      },
    };
    const redacted = cap.redactProvenance({ projectId: 'p1' }, result);
    expect(redacted.args).toEqual({ projectId: 'p1' });
    expect(redacted.resultPreview).not.toContain('sensitive'); // the jot text is not persisted verbatim
    expect(redacted.resultPreview).toContain('1 idea'); // a count summary, not the content
  });
});
