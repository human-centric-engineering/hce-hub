/**
 * Consumer — Project Plan view (feature tree)
 *
 * GET /api/v1/projects/:id/plan — the project's features in `planOrder()`, each
 * with dependency chips, its task table (effective status), and resolved owner/
 * claimer identities. The single enriched read the Plan view renders (no N+1).
 *
 * Fork-owned (f-plan-view, feature 09). Routes through `getProjectPlan` →
 * `getAccessibleProject`, so a **non-member or unknown id is a 404, never a 403**
 * (anti-enumeration).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { getProjectPlan } from '@/lib/projects/plan';

export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const plan = await getProjectPlan(session.user.id, id);

  log.info('Project plan fetched', { userId: session.user.id, projectId: id });
  return successResponse(plan);
});
