/**
 * Tests for `lib/projects/capture-idea-service.ts` — the parking-gesture core
 * (f-idea-capture §22). Pins the membership funnel (deny ≡ NotFoundError, no
 * write), the create of an `open` idea in the project inbox (NOT a feature, NOT
 * journalled) with a project-wide `#N` from the atomic counter bump (t-63), and
 * the admin audit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/projects/access', () => ({ canAccessProject: vi.fn() }));
vi.mock('@/lib/db/utils', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/lib/orchestration/audit/admin-audit-logger', () => ({ logAdminAction: vi.fn() }));

const { canAccessProject } = await import('@/lib/projects/access');
const { executeTransaction } = await import('@/lib/db/utils');
const { logAdminAction } = await import('@/lib/orchestration/audit/admin-audit-logger');
const { NotFoundError } = await import('@/lib/api/errors');
const { captureIdea } = await import('@/lib/projects/capture-idea-service');

const access = canAccessProject as ReturnType<typeof vi.fn>;
const runTx = executeTransaction as ReturnType<typeof vi.fn>;
const audit = logAdminAction as ReturnType<typeof vi.fn>;

const USER = 'user-1';

/** A tx double: the counter bump returns `ideaCounter`, then idea.create echoes it. */
function makeTx(nextNumber: number) {
  const projectUpdate = vi.fn().mockResolvedValue({ ideaCounter: nextNumber });
  const ideaCreate = vi
    .fn()
    .mockImplementation(({ data }: { data: { number: number } }) =>
      Promise.resolve({ id: 'idea-1', number: data.number })
    );
  return { project: { update: projectUpdate }, idea: { create: ideaCreate } };
}

beforeEach(() => {
  vi.clearAllMocks();
  access.mockResolvedValue({ ok: true, basis: 'member' });
});

describe('captureIdea', () => {
  it('throws NotFoundError for a non-member / unknown project (no write)', async () => {
    access.mockResolvedValue({ ok: false, basis: null });
    await expect(captureIdea(USER, 'p1', 'an idea')).rejects.toBeInstanceOf(NotFoundError);
    expect(runTx).not.toHaveBeenCalled();
  });

  it('assigns #N via the atomic counter bump, creates an `open` idea, and audits it', async () => {
    const tx = makeTx(4);
    runTx.mockImplementation((work: (t: unknown) => unknown) => work(tx));

    const r = await captureIdea(USER, 'p1', 'board merged column: cap 5/person');

    expect(r).toEqual({ ideaId: 'idea-1', number: 4 });
    // Counter bumped atomically inside the transaction.
    expect(tx.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { ideaCounter: { increment: 1 } },
      select: { ideaCounter: true },
    });
    // The idea is born `open`, carrying the freshly bumped number.
    expect(tx.idea.create).toHaveBeenCalledWith({
      data: {
        projectId: 'p1',
        number: 4,
        text: 'board merged column: cap 5/person',
        createdByUserId: USER,
        status: 'open',
      },
      select: { id: true, number: true },
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'idea.capture',
        entityType: 'app_idea',
        entityId: 'idea-1',
        metadata: { projectId: 'p1', number: 4 },
      })
    );
  });

  it('throws (fails loud) rather than coining a #0 handle if the create returns a null number', async () => {
    // `number` is non-null by construction (the just-bumped counter). A null would be
    // a broken invariant — we throw instead of returning a bogus `#0`, and we do NOT
    // audit the capture.
    const tx = {
      project: { update: vi.fn().mockResolvedValue({ ideaCounter: 1 }) },
      idea: { create: vi.fn().mockResolvedValue({ id: 'idea-1', number: null }) },
    };
    runTx.mockImplementation((work: (t: unknown) => unknown) => work(tx));

    await expect(captureIdea(USER, 'p1', 'a jot')).rejects.toThrow('without a number');
    expect(audit).not.toHaveBeenCalled();
  });
});
