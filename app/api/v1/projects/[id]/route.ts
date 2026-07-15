/**
 * Consumer — Single project (view header)
 *
 * GET /api/v1/projects/:id — the project-view header for a member.
 *
 * Fork-owned (f-projects, feature 08). Routes through `getProjectForUser` →
 * `getAccessibleProject`, so a **non-member or unknown id is a 404, never a
 * 403** (anti-enumeration). Feature/task lists (Plan/Board) are §09/§10.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { getProjectForUser } from '@/lib/projects/consumer';

export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const project = await getProjectForUser(session.user.id, id);

  log.info('Consumer project fetched', { userId: session.user.id, projectId: id });
  return successResponse(project);
});
