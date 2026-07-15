/**
 * Consumer — Projects (list)
 *
 * GET /api/v1/projects — the caller's own projects (membership-scoped).
 *
 * Fork-owned (f-projects, feature 08). `withAuth` (session or `sk_` key → the
 * caller's user id); the funnel returns only projects the caller is a member of.
 * The *admin* surface (`/api/v1/admin/projects`) is a different, role-gated
 * endpoint that sees all projects — this one is scoped to the caller.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { listProjectsForUser } from '@/lib/projects/consumer';

export const GET = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const projects = await listProjectsForUser(session.user.id);
  log.info('Consumer projects listed', { userId: session.user.id, count: projects.length });
  return successResponse(projects);
});
