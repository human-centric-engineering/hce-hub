/**
 * Update-an-idea service (f-idea-capture §22).
 *
 * The low-structure, human-native lifecycle ops on an inbox idea: **edit** its
 * text (ideas evolve — unlike AI-authored features/tasks, a jot is meant to be
 * refined) and **drop / restore** it (`status` open ↔ dropped; a dropped idea is
 * retained as a browseable archive, never deleted). Shared by the `update_idea`
 * capability and the `PATCH …/ideas/:ideaId` route so both can't drift.
 *
 * Promotion is NOT here — an idea becomes a feature/task/phase/bug via the create
 * verbs' `fromIdeaId` (see `idea-promotion.ts`), so `promoted` is a terminal state
 * this service refuses to touch.
 *
 * Membership is the [[f-access]] funnel's (`canAccessProject`, member tier — any
 * member may tend the inbox): a non-member / unknown idea sees `NotFoundError`
 * (→ 404, no enumeration). Ideas stay out of the project journal; admin-audited.
 */
import { prisma } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { canAccessProject } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';

/** The editable idea status via this service (promotion is `fromIdeaId`, not here). */
export type IdeaLifecycleStatus = 'open' | 'dropped';

export interface UpdateIdeaPatch {
  text?: string;
  status?: IdeaLifecycleStatus;
}

export interface UpdateIdeaResult {
  ideaId: string;
  projectId: string;
  status: string;
}

/**
 * Edit and/or drop-restore an idea. Throws `NotFoundError` (→ 404) for a
 * non-member / unknown idea, and `ValidationError` (→ 400) when nothing is
 * supplied or the idea is already `promoted` (terminal).
 */
export async function updateIdea(
  userId: string,
  ideaId: string,
  patch: UpdateIdeaPatch,
  /** When set (the REST route), the idea must belong to this project — else 404,
   * before any write, so a nested URL can't mutate an idea in another project. */
  expectedProjectId?: string
): Promise<UpdateIdeaResult> {
  if (patch.text === undefined && patch.status === undefined) {
    throw new ValidationError('Provide a new text and/or status.');
  }

  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { projectId: true, status: true },
  });
  if (!idea) {
    throw new NotFoundError(`Idea ${ideaId} not found`);
  }
  // REST-nesting integrity: the idea must be under the project the URL named.
  if (expectedProjectId !== undefined && idea.projectId !== expectedProjectId) {
    throw new NotFoundError(`Idea ${ideaId} not found`);
  }

  // Membership funnel on the idea's own project (a non-member sees not_found).
  const { basis } = await canAccessProject(userId, idea.projectId);
  if (basis === null) {
    throw new NotFoundError(`Idea ${ideaId} not found`);
  }

  // A promoted idea already became a feature/task/phase/bug — it's terminal here.
  if (idea.status === 'promoted') {
    throw new ValidationError('That idea has already been promoted and can no longer be edited.');
  }

  const updated = await prisma.idea.update({
    where: { id: ideaId },
    data: {
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
    select: { id: true, projectId: true, status: true },
  });

  logAdminAction({
    userId,
    action: 'idea.update',
    entityType: 'app_idea',
    entityId: updated.id,
    metadata: {
      projectId: updated.projectId,
      textChanged: patch.text !== undefined,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    },
  });

  return { ideaId: updated.id, projectId: updated.projectId, status: updated.status };
}
