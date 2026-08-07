/**
 * Consumer — file a feature under a phase (f-phases §22 t3)
 *
 * PATCH /api/v1/projects/:id/features/:key/phase — set the feature's phase
 * (`{ phaseId }`), or null to unfile it. The plan's per-feature phase picker.
 *
 * **Member-tier**: filing is collaborative roadmap organisation (like creating a
 * feature), so any project member may file any feature — not just its owner
 * (there is one lead per project, so an owner-only rule would strand members).
 * Auth + the automatic cap come from `withAuth`; `assignFeatureToPhase` routes
 * through the [[f-access]] funnel and is scoped to `:id`, so a non-member, unknown
 * id, or a feature in another project is a **404, never 403**. `key` is the
 * feature's cuid `id`.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { assignFeatureToPhase } from '@/lib/projects/phases-service';

const bodySchema = z.object({
  phaseId: z.string().min(1).nullable(),
});

export const PATCH = withAuth<{ id: string; key: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId, key: rawKey } = await params;
  const id = parseCuidParam(rawId);
  const featureId = parseCuidParam(rawKey);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('A phaseId (or null to unfile) is required.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  // `id` scopes the feature to this project (no cross-project id-swap).
  const result = await assignFeatureToPhase(session.user.id, featureId, parsed.data.phaseId, id);

  log.info('Feature phase assigned', {
    userId: session.user.id,
    projectId: id,
    featureId,
    phaseId: result.phaseId,
  });
  return successResponse(result);
});
