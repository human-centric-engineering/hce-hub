/**
 * Capture-an-idea service (f-idea-capture §22-03 t-58).
 *
 * The core of the **parking gesture**: jot a line, and it lands as an *indicative*
 * feature stub filed into the project's **parked** phase (the Ideas Park) — to be
 * triaged later (promote into an active phase via the shipped phase-move, or drop).
 * Deliberately a **lighter** path than `create_feature` (no slug / deps / references
 * / task sketch): a jot is just text. Shared by the `capture_idea` MCP capability
 * and the `POST …/ideas` route so both can't drift.
 *
 * Membership is the [[f-access]] funnel's (`canAccessProject`): a non-member sees
 * `NotFoundError` (→ not_found, no enumeration). The stub is born unowned +
 * `planning`/`indicative`, exactly like `create_feature`'s — you claim it (or
 * flesh it out) when you promote it.
 */
import { prisma } from '@/lib/db/client';
import { executeTransaction } from '@/lib/db/utils';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { canAccessProject } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { recordProjectEvent } from '@/lib/projects/project-event';

export interface CaptureIdeaResult {
  featureId: string;
  /** The parked phase the idea landed in (the Ideas Park). */
  phaseId: string;
}

/**
 * Capture `text` as an indicative feature stub in `projectId`'s parked phase.
 * Throws `NotFoundError` (→ 404) for a non-member / unknown project, and
 * `ValidationError` when the project has no parked phase to capture into.
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

  // The Ideas Park is the home (per-project parked phase — the settled HB8 call).
  // First parked phase by display order; a project with none can't capture yet.
  const park = await prisma.phase.findFirst({
    where: { projectId, status: 'parked' },
    orderBy: [{ ordinal: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (!park) {
    throw new ValidationError(
      'This project has no parked phase to capture into — create one (e.g. "Ideas Park") first.'
    );
  }

  const feature = await executeTransaction(async (tx) => {
    // Bump the project counter for a stable project-wide §N (mirrors create_feature).
    const { featureCounter } = await tx.project.update({
      where: { id: projectId },
      data: { featureCounter: { increment: 1 } },
      select: { featureCounter: true },
    });
    const created = await tx.feature.create({
      data: {
        projectId,
        number: featureCounter,
        title: text,
        status: 'planning',
        planningStage: 'indicative',
        ownerUserId: null, // unowned — claim/flesh out when promoted
        phaseId: park.id,
      },
      select: { id: true },
    });
    // Journal as a feature creation, tagged `captured` so the parking gesture is
    // distinguishable from a full author without a new event kind.
    await recordProjectEvent(tx, {
      projectId,
      featureId: created.id,
      kind: 'feature_created',
      actorUserId: userId,
      metadata: { captured: true, phaseId: park.id },
    });
    return created;
  });

  logAdminAction({
    userId,
    action: 'idea.capture',
    entityType: 'app_feature',
    entityId: feature.id,
    metadata: { projectId, phaseId: park.id },
  });

  return { featureId: feature.id, phaseId: park.id };
}
