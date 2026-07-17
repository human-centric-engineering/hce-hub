/**
 * Tests for `lib/projects/capabilities/add-note.ts` — the authored `note`
 * journal verb (lighter sibling of record_decision). Pins the scope guard, the
 * funnel not_found mapping, the note write (optional title), and provenance
 * redaction of the free-text body.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveEventScope: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveEventScope } = await import('@/lib/projects/access');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { AddNoteCapability } = await import('@/lib/projects/capabilities/add-note');

const scopeFn = resolveEventScope as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new AddNoteCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

beforeEach(() => {
  vi.clearAllMocks();
  emit.mockResolvedValue({ id: 'evt-9' });
});

describe('add_note guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ body: 'b', projectId: 'p1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(scopeFn).not.toHaveBeenCalled();
  });

  it('errors invalid_scope when neither projectId nor featureId is given', async () => {
    const r = await cap.execute({ body: 'b' }, ctx());
    expect(r.error?.code).toBe('invalid_scope');
    expect(scopeFn).not.toHaveBeenCalled();
  });

  it('maps a funnel denial to not_found and writes nothing', async () => {
    scopeFn.mockResolvedValue({ ok: false });
    const r = await cap.execute({ body: 'b', projectId: 'p1' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('add_note write', () => {
  it('adds a feature-scoped note with an optional title', async () => {
    scopeFn.mockResolvedValue({ ok: true, projectId: 'p1', featureId: 'f1' });

    const r = await cap.execute(
      { featureId: 'f1', title: 'Heads-up', body: 'Watch the migration.' },
      ctx()
    );

    expect(r).toEqual({ success: true, data: { eventId: 'evt-9' } });
    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f1',
      kind: 'note',
      actorUserId: USER,
      title: 'Heads-up',
      body: 'Watch the migration.',
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'journal.add_note', entityId: 'evt-9' })
    );
  });

  it('adds a project-scoped note and nulls the title when omitted', async () => {
    scopeFn.mockResolvedValue({ ok: true, projectId: 'p1', featureId: null });

    await cap.execute({ projectId: 'p1', body: 'just a link' }, ctx());

    const payload = emit.mock.calls[0][1];
    expect(payload).toMatchObject({ projectId: 'p1', featureId: null, kind: 'note', title: null });
  });
});

describe('add_note redactProvenance', () => {
  it('masks the free-text body (and title when present)', () => {
    const out = cap.redactProvenance(
      { featureId: 'f1', title: 'secret heading', body: 'secret note' },
      { success: true, data: { eventId: 'e' } }
    );
    const a = out.args as Record<string, string | null>;
    expect(a.body).not.toContain('secret note');
    expect(a.title).not.toContain('secret heading');
    expect(a.featureId).toBe('f1');
  });

  it('leaves title null when it was omitted', () => {
    const out = cap.redactProvenance(
      { projectId: 'p1', body: 'x' },
      { success: true, data: { eventId: 'e' } }
    );
    expect((out.args as Record<string, string | null>).title).toBeNull();
  });
});
