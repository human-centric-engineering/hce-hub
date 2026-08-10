/**
 * Capture-an-idea service (f-idea-capture §22).
 *
 * The core of the **parking gesture**: jot a line, and it lands as an `Idea` in
 * the project's inbox — an item that lives **outside** the plan/phase/feature
 * graph, because at capture time we don't yet know what it is. Triage promotes it
 * later (into a feature, a task, a new phase, or a bug) or drops it. Shared by the
 * `capture_idea` MCP capability and the `POST …/ideas` route so both can't drift.
 *
 * Membership is the [[f-access]] funnel's (`canAccessProject`): a non-member sees
 * `NotFoundError` (→ not_found, no enumeration). An idea is born `open`, unowned
 * except for `createdByUserId` (a hand-FK → user, SetNull on erasure).
 *
 * Ideas are **not** journalled — capture is pre-commitment, so it's admin-audited
 * only; the real `feature_created` / `task_created` event fires when the idea is
 * *promoted* into something.
 */
import { prisma } from '@/lib/db/client';
import { NotFoundError } from '@/lib/api/errors';
import { canAccessProject } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';

export interface CaptureIdeaResult {
  ideaId: string;
}

/**
 * Capture `text` as an `open` idea in `projectId`'s inbox. Throws `NotFoundError`
 * (→ 404) for a non-member / unknown project.
 */
export async function captureIdea(
  userId: string,
  projectId: string,
  text: string
): Promise<CaptureIdeaResult> {
  // Any member may capture; a non-member sees not_found (no enumeration).
  const { basis } = await canAccessProject(userId, projectId);
  if (basis === null) {
    throw new NotFoundError(`Project ${projectId} not found`);
  }

  const idea = await prisma.idea.create({
    data: { projectId, text, createdByUserId: userId, status: 'open' },
    select: { id: true },
  });

  logAdminAction({
    userId,
    action: 'idea.capture',
    entityType: 'app_idea',
    entityId: idea.id,
    metadata: { projectId },
  });

  return { ideaId: idea.id };
}
