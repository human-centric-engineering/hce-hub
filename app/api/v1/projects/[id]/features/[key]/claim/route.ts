/**
 * Consumer — claim a feature (feature page action)
 *
 * POST /api/v1/projects/:id/features/:key/claim — take ownership of the feature
 * (owner = caller, status → in_flight) and return soft warnings (already owned by
 * someone else; never a hard lock, §5). The HTTP face of the same `claimFeature()`
 * core the `claim_feature` MCP/chat capability runs, so the two never drift.
 *
 * Fork-owned (f-feature-planning §18 t-4). Auth + the automatic per-section write
 * cap come from `withAuth`; `claimFeature` routes through the [[f-access]] funnel,
 * so a **non-member, unknown id, or a feature in another project is a 404, never a
 * 403**. `key` is the feature's cuid `id` here (the button sends `feature.id`).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { claimFeature } from '@/lib/projects/claim-feature-service';

export const POST = withAuth<{ id: string; key: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId, key: rawKey } = await params;
  const id = parseCuidParam(rawId);
  const featureId = parseCuidParam(rawKey);

  // `id` scopes the feature to this project (no cross-project id-swap).
  const result = await claimFeature(session.user.id, featureId, id);

  log.info('Feature claimed', {
    userId: session.user.id,
    projectId: id,
    featureId,
    warnings: result.warnings.length,
  });
  return successResponse(result);
});
