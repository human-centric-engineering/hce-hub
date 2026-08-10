/**
 * Tests for `lib/projects/update-idea-service.ts` — edit + drop/restore of an
 * inbox idea. Pins the empty-patch guard, the funnel (deny ≡ NotFoundError), the
 * REST-nesting `expectedProjectId` guard (no write on mismatch), the promoted
 * terminal guard, and the partial update + audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ canAccessProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { idea: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { canAccessProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { NotFoundError, ValidationError } = await import('@/lib/api/errors');
const { updateIdea } = await import('@/lib/projects/update-idea-service');

const access = canAccessProject as ReturnType<typeof vi.fn>;
const ideaFindUnique = prisma.idea.findUnique as ReturnType<typeof vi.fn>;
const ideaUpdate = prisma.idea.update as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ ok: true, basis: 'member' });
  ideaFindUnique.mockResolvedValue({ projectId: 'p1', status: 'open' });
  ideaUpdate.mockResolvedValue({ id: 'idea-1', projectId: 'p1', status: 'open' });
});

describe('updateIdea', () => {
  it('rejects an empty patch before any read', async () => {
    await expect(updateIdea(USER, 'idea-1', {})).rejects.toBeInstanceOf(ValidationError);
    expect(ideaFindUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for an unknown idea (no write)', async () => {
    ideaFindUnique.mockResolvedValue(null);
    await expect(updateIdea(USER, 'ghost', { status: 'dropped' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(ideaUpdate).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a non-member (funnel deny, no write)', async () => {
    access.mockResolvedValue({ ok: false, basis: null });
    await expect(updateIdea(USER, 'idea-1', { text: 'x' })).rejects.toBeInstanceOf(NotFoundError);
    expect(ideaUpdate).not.toHaveBeenCalled();
  });

  it('404s (NotFoundError) when the idea is not under the expected project — before any write', async () => {
    ideaFindUnique.mockResolvedValue({ projectId: 'other', status: 'open' });
    await expect(updateIdea(USER, 'idea-1', { text: 'x' }, 'p1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(access).not.toHaveBeenCalled();
    expect(ideaUpdate).not.toHaveBeenCalled();
  });

  it('refuses to edit a promoted (terminal) idea', async () => {
    ideaFindUnique.mockResolvedValue({ projectId: 'p1', status: 'promoted' });
    await expect(updateIdea(USER, 'idea-1', { status: 'dropped' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(ideaUpdate).not.toHaveBeenCalled();
  });

  it('edits the text (partial update) and audits it', async () => {
    ideaUpdate.mockResolvedValue({ id: 'idea-1', projectId: 'p1', status: 'open' });
    const r = await updateIdea(USER, 'idea-1', { text: 'refined jot' });
    expect(ideaUpdate).toHaveBeenCalledWith({
      where: { id: 'idea-1' },
      data: { text: 'refined jot' },
      select: { id: true, projectId: true, status: true },
    });
    expect(r).toEqual({ ideaId: 'idea-1', projectId: 'p1', status: 'open' });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'idea.update',
        entityType: 'app_idea',
        entityId: 'idea-1',
        metadata: expect.objectContaining({ projectId: 'p1', textChanged: true }),
      })
    );
  });

  it('drops the idea (status only, no text change)', async () => {
    ideaUpdate.mockResolvedValue({ id: 'idea-1', projectId: 'p1', status: 'dropped' });
    const r = await updateIdea(USER, 'idea-1', { status: 'dropped' });
    expect(ideaUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'dropped' } })
    );
    expect(r.status).toBe('dropped');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ status: 'dropped' }) })
    );
  });
});
