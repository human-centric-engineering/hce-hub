/**
 * Tests for `lib/projects/capabilities/record-decision.ts` — the authored
 * `decision` journal verb. Pins the scope guard (projectId or featureId
 * required), the funnel `not_found` mapping, the event write (kind/scope/actor,
 * category metadata), and free-text provenance redaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ resolveEventScope: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: {} }));
vi.mock('@/lib/projects/project-event', () => ({ recordProjectEvent: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { resolveEventScope } = await import('@/lib/projects/access');
const { recordProjectEvent } = await import('@/lib/projects/project-event');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { RecordDecisionCapability } = await import('@/lib/projects/capabilities/record-decision');

const scopeFn = resolveEventScope as ReturnType<typeof vi.fn>;
const emit = recordProjectEvent as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const cap = new RecordDecisionCapability();
const USER = 'user-1';
const ctx = (userId: string | null = USER) => ({ userId, agentId: 'a1' });

beforeEach(() => {
  vi.clearAllMocks();
  emit.mockResolvedValue({ id: 'evt-1' });
});

describe('record_decision guards', () => {
  it('errors no_user_context for a null-user run', async () => {
    const r = await cap.execute({ title: 't', body: 'b', projectId: 'p1' }, ctx(null));
    expect(r.error?.code).toBe('no_user_context');
    expect(scopeFn).not.toHaveBeenCalled();
  });

  it('errors invalid_scope when neither projectId nor featureId is given', async () => {
    const r = await cap.execute({ title: 't', body: 'b' }, ctx());
    expect(r.error?.code).toBe('invalid_scope');
    expect(scopeFn).not.toHaveBeenCalled();
  });

  it('maps a funnel denial to not_found (no enumeration) and writes nothing', async () => {
    scopeFn.mockResolvedValue({ ok: false });
    const r = await cap.execute({ title: 't', body: 'b', featureId: 'f1' }, ctx());
    expect(r.error?.code).toBe('not_found');
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('record_decision write', () => {
  it('records a feature-scoped decision with category metadata', async () => {
    scopeFn.mockResolvedValue({ ok: true, projectId: 'p1', featureId: 'f1' });

    const r = await cap.execute(
      {
        featureId: 'f1',
        title: 'One journal',
        body: 'One stream, many views.',
        category: 'architecture',
      },
      ctx()
    );

    expect(r).toEqual({ success: true, data: { eventId: 'evt-1' } });
    expect(scopeFn).toHaveBeenCalledWith(USER, { projectId: undefined, featureId: 'f1' });
    expect(emit).toHaveBeenCalledWith(expect.anything(), {
      projectId: 'p1',
      featureId: 'f1',
      kind: 'decision',
      actorUserId: USER,
      title: 'One journal',
      body: 'One stream, many views.',
      metadata: { category: 'architecture' },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'journal.record_decision',
        entityType: 'app_project_event',
        entityId: 'evt-1',
      })
    );
  });

  it('records a project-scoped decision and omits metadata when no category', async () => {
    scopeFn.mockResolvedValue({ ok: true, projectId: 'p1', featureId: null });

    await cap.execute({ projectId: 'p1', title: 'ADR', body: 'why' }, ctx());

    const payload = emit.mock.calls[0][1];
    expect(payload.featureId).toBeNull();
    expect(payload.kind).toBe('decision');
    expect(payload).not.toHaveProperty('metadata');
  });
});

describe('record_decision redactProvenance', () => {
  it('masks the free-text title + body, keeps scope + category', () => {
    const out = cap.redactProvenance(
      { projectId: 'p1', title: 'secret heading', body: 'secret rationale', category: 'process' },
      { success: true, data: { eventId: 'e' } }
    );
    const a = out.args as Record<string, string | null>;
    expect(a.title).not.toContain('secret heading');
    expect(a.body).not.toContain('secret rationale');
    expect(a.category).toBe('process');
    expect(a.projectId).toBe('p1');
  });
});
