/**
 * Tests for `lib/projects/capabilities/capture-idea.ts` — a thin wrapper over the
 * shared `captureIdea` core. Pins the no-user guard, error mapping (funnel
 * `not_found`), forwarding the caller + scope, and the free-text jot being masked
 * in provenance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/capture-idea-service', () => ({ captureIdea: vi.fn() }));

const { captureIdea } = await import('@/lib/projects/capture-idea-service');
const { NotFoundError } = await import('@/lib/api/errors');
const { CaptureIdeaCapability } = await import('@/lib/projects/capabilities/capture-idea');

const capture = captureIdea as ReturnType<typeof vi.fn>;
const cap = new CaptureIdeaCapability();
const ctx = (userId: string | null = 'u1') => ({ userId, agentId: 'a1' });

beforeEach(() => vi.clearAllMocks());

describe('capture_idea capability', () => {
  it('errors no_user_context for a null-user run, without calling the core', async () => {
    const r = await cap.execute({ projectId: 'p1', text: 'x' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(capture).not.toHaveBeenCalled();
  });

  it('maps a funnel NotFoundError to not_found', async () => {
    capture.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ projectId: 'p1', text: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('returns ideaId on success, forwarding the caller + project + text', async () => {
    capture.mockResolvedValue({ ideaId: 'idea1' });
    const r = await cap.execute({ projectId: 'p1', text: 'an idea' }, ctx('caller'));
    expect(r).toEqual({ success: true, data: { ideaId: 'idea1' } });
    expect(capture).toHaveBeenCalledWith('caller', 'p1', 'an idea');
  });

  it('trims surrounding whitespace so the MCP face matches the HTTP route', () => {
    // The dispatcher runs `validate` (the Zod schema) before `execute`; the route
    // trims too, so both faces store the same title — no whitespace drift.
    expect(cap.validate({ projectId: 'p1', text: '  an idea  ' }).text).toBe('an idea');
  });

  it('rejects an all-whitespace jot (empty after trim), like the route', () => {
    expect(() => cap.validate({ projectId: 'p1', text: '   ' })).toThrow();
  });

  it('masks the free-text jot in provenance, keeping the project scope', () => {
    const redacted = cap.redactProvenance(
      { projectId: 'p1', text: 'a sensitive idea about someone' },
      { success: true, data: { ideaId: 'idea1' } }
    );
    const args = redacted.args as { projectId: string; text: string };
    expect(args.projectId).toBe('p1');
    expect(args.text).not.toContain('sensitive'); // the jot text is not persisted verbatim
  });
});
