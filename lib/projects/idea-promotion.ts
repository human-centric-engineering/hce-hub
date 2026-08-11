/**
 * Idea promotion — the shared resolve step behind `fromIdeaId` on the create
 * verbs (f-idea-capture §22). Promoting an idea = creating the thing it becomes
 * (a feature / task / phase / bug) AND marking the idea `promoted`, atomically.
 *
 * `checkIdeaPromotable` is the pre-write, friendly-error check (the idea exists,
 * is `open`, and belongs to this project). `resolveIdeaOnPromotion` runs INSIDE
 * the create's transaction and flips the idea with a `status:'open'` guard as the
 * race backstop — so an idea can never be double-promoted (a losing caller throws,
 * rolling back its own create). Promotion is capability-mediated (Claude Code now,
 * the sidekick later) — never a bespoke endpoint; see the f-idea-capture journal.
 */
import { type IdeaOutcome } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { ConflictError } from '@/lib/api/errors';

/** The transaction client `executeTransaction` hands its callback (matches the create verbs). */
type Tx = Parameters<Parameters<typeof executeTransaction>[0]>[0];

export type IdeaPromotableCheck =
  { ok: true } | { ok: false; code: 'invalid_idea' | 'idea_not_open'; message: string };

/** Friendly pre-write check: the idea must exist in `projectId` and be `open`. */
export async function checkIdeaPromotable(
  projectId: string,
  ideaId: string
): Promise<IdeaPromotableCheck> {
  const idea = await prisma.idea.findFirst({
    where: { id: ideaId, projectId },
    select: { status: true },
  });
  if (!idea) {
    return { ok: false, code: 'invalid_idea', message: 'That idea was not found in this project.' };
  }
  if (idea.status !== 'open') {
    return { ok: false, code: 'idea_not_open', message: `That idea is already ${idea.status}.` };
  }
  return { ok: true };
}

/**
 * Inside the create's transaction, mark the idea promoted into `kind` (refId =
 * the created entity's id). Guarded on `status:'open'` so a concurrent promotion
 * can't double-resolve — a losing caller throws, rolling back its own create.
 */
export async function resolveIdeaOnPromotion(
  tx: Tx,
  args: { ideaId: string; projectId: string; kind: IdeaOutcome; refId: string }
): Promise<void> {
  const { count } = await tx.idea.updateMany({
    where: { id: args.ideaId, projectId: args.projectId, status: 'open' },
    data: {
      status: 'promoted',
      promotedKind: args.kind,
      promotedRefId: args.refId,
      triagedAt: new Date(),
    },
  });
  if (count !== 1) {
    throw new ConflictError(`Idea ${args.ideaId} was already triaged`);
  }
}
