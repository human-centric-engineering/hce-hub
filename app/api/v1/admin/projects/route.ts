/**
 * Admin — Projects (list + create)
 *
 * GET  /api/v1/admin/projects       — paginated list with optional `q` search
 * POST /api/v1/admin/projects       — create a project (seats the lead + a
 *                                       per-project knowledge tag transactionally)
 *
 * Fork-owned (f-project-admin, feature 05). Admin-gated via `withAdminAuth`
 * (which also carries the `sk_` key fallback and the automatic admin-section
 * rate limit in `proxy.ts`). This is the *admin* surface — it manages all
 * projects by role, and is the writer of the `ProjectMember` rows the f-access
 * membership funnel later reads. Not membership-scoped.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, paginatedResponse } from '@/lib/api/responses';
import { validateRequestBody, validateQueryParams } from '@/lib/api/validation';
import { getClientIP } from '@/lib/security/ip';
import { getRouteLogger } from '@/lib/api/context';
import { listProjects, createProject } from '@/lib/projects/admin';
import { createProjectSchema, listProjectsQuerySchema } from '@/lib/validations/project-admin';

export const GET = withAdminAuth(async (request, _session) => {
  const log = await getRouteLogger(request);
  const { searchParams } = new URL(request.url);
  const { page, limit, q } = validateQueryParams(searchParams, listProjectsQuerySchema);

  const { items, total } = await listProjects({ page, limit, q });

  log.info('Projects listed', { count: items.length, total, page, limit });
  return paginatedResponse(items, { page, limit, total });
});

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, createProjectSchema);

  const project = await createProject(body, {
    userId: session.user.id,
    clientIp: getClientIP(request),
  });

  log.info('Project created', { projectId: project.id, adminId: session.user.id });
  return successResponse(project, undefined, { status: 201 });
});
