/**
 * Tests for `lib/projects/idea-promotion.ts` — the shared resolve step behind
 * `fromIdeaId`. Pins the pre-write check (exists/open/scoped) and the in-tx flip,
 * including the `status:'open'` race backstop (count ≠ 1 ⇒ ConflictError, which
 * rolls back the create).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { idea: { findFirst: vi.fn() } } }));

const { prisma } = await import('@/lib/db/client');
const { ConflictError } = await import('@/lib/api/errors');
const { checkIdeaPromotable, resolveIdeaOnPromotion } =
  await import('@/lib/projects/idea-promotion');

const ideaFindFirst = prisma.idea.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('checkIdeaPromotable', () => {
  it('ok for an open idea in the project', async () => {
    ideaFindFirst.mockResolvedValue({ status: 'open' });
    expect(await checkIdeaPromotable('p1', 'idea-1')).toEqual({ ok: true });
    expect(ideaFindFirst).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1' },
      select: { status: true },
    });
  });

  it('invalid_idea when not found in this project', async () => {
    ideaFindFirst.mockResolvedValue(null);
    expect(await checkIdeaPromotable('p1', 'ghost')).toMatchObject({
      ok: false,
      code: 'invalid_idea',
    });
  });

  it('idea_not_open when already promoted/dropped', async () => {
    ideaFindFirst.mockResolvedValue({ status: 'dropped' });
    expect(await checkIdeaPromotable('p1', 'idea-1')).toMatchObject({
      ok: false,
      code: 'idea_not_open',
    });
  });
});

describe('resolveIdeaOnPromotion', () => {
  it('flips an open idea to promoted, guarded on status:open', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await resolveIdeaOnPromotion({ idea: { updateMany } } as never, {
      ideaId: 'idea-1',
      projectId: 'p1',
      kind: 'feature',
      refId: 'f-1',
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'idea-1', projectId: 'p1', status: 'open' },
      data: {
        status: 'promoted',
        promotedKind: 'feature',
        promotedRefId: 'f-1',
        triagedAt: expect.any(Date),
      },
    });
  });

  it('throws ConflictError when the idea was already triaged (count ≠ 1 — rolls back)', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(
      resolveIdeaOnPromotion({ idea: { updateMany } } as never, {
        ideaId: 'idea-1',
        projectId: 'p1',
        kind: 'phase',
        refId: 'ph-1',
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
