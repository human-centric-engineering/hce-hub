/**
 * Consumer — single feature detail (feature page)
 *
 * GET /api/v1/projects/:id/features/:key — one feature's full detail
 * (description, done-when, references, dependency chips, and its task surface —
 * real tasks once planned, or the indicative sketch) for the shareable feature
 * page at `/projects/<id>/features/<slug>`. `key` is the human `slug` (the
 * shareable key) or the cuid `id`.
 *
 * Fork-owned (f-feature-planning §18 t-3). Routes through `getFeatureDetail` →
 * `getAccessibleProject`, so a **non-member, unknown id/slug, or a feature in
 * another project is a 404, never a 403** (anti-enumeration + no cross-project
 * id-swap). The feature-scoped journal is a separate read (`…/events?featureId=`).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getFeatureDetail } from '@/lib/projects/feature-detail';

export const GET = withAuth<{ id: string; key: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId, key: rawKey } = await params;
  // Both segments are a slug OR a cuid, so neither is parseCuidParam'd — the
  // project segment prefers the human slug (§19), the feature `key` its slug; a
  // resolution miss inside getFeatureDetail is the real 404. Just bound lengths.
  const projectRef = rawId.trim();
  const key = rawKey.trim();
  if (projectRef.length === 0 || projectRef.length > 200 || key.length === 0 || key.length > 200) {
    return errorResponse('Feature not found', { code: 'NOT_FOUND', status: 404 });
  }

  const feature = await getFeatureDetail(session.user.id, projectRef, key);

  log.info('Feature detail fetched', {
    userId: session.user.id,
    projectId: feature.projectId,
    featureKey: key,
  });
  return successResponse(feature);
});
