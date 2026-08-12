/**
 * Tests for `lib/projects/capabilities/update-idea.ts` — a thin wrapper over the
 * shared `updateIdea` core. Pins the no-user guard, error mapping (funnel
 * `not_found`, `invalid_update` for empty/promoted), the "at least one field"
 * schema refine, and the free-text jot masked in provenance.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/update-idea-service', () => ({ updateIdea: vi.fn() }));

const { updateIdea } = await import('@/lib/projects/update-idea-service');
const { NotFoundError, ValidationError } = await import('@/lib/api/errors');
const { UpdateIdeaCapability } = await import('@/lib/projects/capabilities/update-idea');

const update = updateIdea as ReturnType<typeof vi.fn>;
const cap = new UpdateIdeaCapability();
const ctx = (userId: string | null = 'u1', scope?: Record<string, string>) => ({
  userId,
  agentId: 'a1',
  ...(scope ? { scope } : {}),
});

beforeEach(() => vi.clearAllMocks());

describe('update_idea capability', () => {
  it('errors no_user_context for a null-user run, without calling the core', async () => {
    const r = await cap.execute({ ideaId: 'idea-1', status: 'dropped' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(update).not.toHaveBeenCalled();
  });

  it('maps a funnel NotFoundError to not_found', async () => {
    update.mockRejectedValue(new NotFoundError('nope'));
    const r = await cap.execute({ ideaId: 'idea-1', text: 'x' }, ctx());
    expect(r.error?.code).toBe('not_found');
  });

  it('maps a ValidationError (empty / promoted) to invalid_update', async () => {
    update.mockRejectedValue(new ValidationError('already promoted'));
    const r = await cap.execute({ ideaId: 'idea-1', status: 'open' }, ctx());
    expect(r.error?.code).toBe('invalid_update');
  });

  it('rethrows a non-mapped error unchanged (only funnel/validation are mapped)', async () => {
    update.mockRejectedValue(new Error('db down'));
    await expect(cap.execute({ ideaId: 'idea-1', text: 'x' }, ctx())).rejects.toThrow('db down');
  });

  it('returns ideaId + status on success, forwarding the caller + patch', async () => {
    update.mockResolvedValue({ ideaId: 'idea-1', projectId: 'p1', status: 'dropped' });
    const r = await cap.execute({ ideaId: 'idea-1', status: 'dropped' }, ctx('caller'));
    expect(r).toEqual({ success: true, data: { ideaId: 'idea-1', status: 'dropped' } });
    expect(update).toHaveBeenCalledWith(
      'caller',
      'idea-1',
      { text: undefined, status: 'dropped' },
      undefined
    );
  });

  it("forwards a project-scoped key's projectId as the cross-project guard", async () => {
    update.mockResolvedValue({ ideaId: 'idea-1', projectId: 'proj-scoped', status: 'dropped' });
    await cap.execute(
      { ideaId: 'idea-1', status: 'dropped' },
      ctx('caller', { projectId: 'proj-scoped' })
    );
    // The scope becomes updateIdea's expectedProjectId → an idea outside the
    // key's project is not_found (hard isolation for this entity-id verb).
    expect(update).toHaveBeenCalledWith(
      'caller',
      'idea-1',
      { text: undefined, status: 'dropped' },
      'proj-scoped'
    );
  });

  it('requires at least one of text/status (schema refine)', () => {
    expect(() => cap.validate({ ideaId: 'idea-1' })).toThrow();
    expect(cap.validate({ ideaId: 'idea-1', status: 'open' }).status).toBe('open');
  });

  it('masks the free-text jot in provenance, keeping ids + status', () => {
    const redacted = cap.redactProvenance(
      { ideaId: 'idea-1', text: 'a sensitive refined idea', status: 'open' },
      { success: true, data: { ideaId: 'idea-1', status: 'open' } }
    );
    const args = redacted.args as { ideaId: string; status: string; text: string };
    expect(args.ideaId).toBe('idea-1');
    expect(args.status).toBe('open');
    expect(args.text).not.toContain('sensitive');
  });

  it('provenance carries null text for a status-only (drop/restore) call', () => {
    const redacted = cap.redactProvenance(
      { ideaId: 'idea-1', status: 'dropped' },
      { success: true, data: { ideaId: 'idea-1', status: 'dropped' } }
    );
    const args = redacted.args as { text: string | null; status: string };
    expect(args.text).toBeNull();
    expect(args.status).toBe('dropped');
  });
});
