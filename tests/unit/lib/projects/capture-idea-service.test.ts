/**
 * Tests for `lib/projects/capture-idea-service.ts` — the parking-gesture core
 * (f-idea-capture §22). Pins the membership funnel (deny ≡ NotFoundError, no
 * write), the create of an `open` idea in the project inbox (NOT a feature, NOT
 * journalled), and the admin audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ canAccessProject: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  prisma: { idea: { create: vi.fn() } },
}));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { canAccessProject } = await import('@/lib/projects/access');
const { prisma } = await import('@/lib/db/client');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { NotFoundError } = await import('@/lib/api/errors');
const { captureIdea } = await import('@/lib/projects/capture-idea-service');

const access = canAccessProject as ReturnType<typeof vi.fn>;
const ideaCreate = prisma.idea.create as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const USER = 'user-1';

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ ok: true, basis: 'member' });
  ideaCreate.mockResolvedValue({ id: 'idea-1' });
});

describe('captureIdea', () => {
  it('throws NotFoundError for a non-member / unknown project (no write)', async () => {
    access.mockResolvedValue({ ok: false, basis: null });
    await expect(captureIdea(USER, 'p1', 'an idea')).rejects.toBeInstanceOf(NotFoundError);
    expect(ideaCreate).not.toHaveBeenCalled();
  });

  it('creates an `open` idea in the project inbox (not a feature) and audits it', async () => {
    const r = await captureIdea(USER, 'p1', 'board merged column: cap 5/person');

    expect(r).toEqual({ ideaId: 'idea-1' });
    expect(ideaCreate).toHaveBeenCalledWith({
      data: {
        projectId: 'p1',
        text: 'board merged column: cap 5/person',
        createdByUserId: USER,
        status: 'open',
      },
      select: { id: true },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'idea.capture',
        entityType: 'app_idea',
        entityId: 'idea-1',
        metadata: { projectId: 'p1' },
      })
    );
  });
});
