/**
 * Consumer — Single project (view header)
 *
 * GET /api/v1/projects/:id — the project-view header for a member. `:id` is the
 * project's **slug** (the shareable key, e.g. `hce-hub`) **or** its cuid `id` —
 * this is the one project route that accepts a slug, so a shared link is durable
 * and human (§19 t-3). Every sub-route (`/plan`, `/board`, `/events`) stays
 * cuid-only and is driven off the canonical `id` this returns.
 *
 * Fork-owned (f-projects, feature 08). Routes through `getProjectForUser` →
 * `getAccessibleProjectByRef`, so a **non-member or unknown id/slug is a 404,
 * never a 403** (anti-enumeration). Feature/task lists (Plan/Board) are §09/§10.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getProjectForUser } from '@/lib/projects/consumer';

export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawRef } = await params;
  // `id` is a slug OR a cuid, so it isn't parseCuidParam'd; just bound its length
  // (a resolution miss inside getProjectForUser is the real 404).
  const ref = rawRef.trim();
  if (ref.length === 0 || ref.length > 200) {
    return errorResponse('Project not found', { code: 'NOT_FOUND', status: 404 });
  }

  const project = await getProjectForUser(session.user.id, ref);

  log.info('Consumer project fetched', { userId: session.user.id, projectId: project.id });
  return successResponse(project);
});
