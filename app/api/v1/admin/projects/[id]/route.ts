/**
 * Admin — Single project (GET / PATCH / DELETE)
 *
 * GET    /api/v1/admin/projects/:id   — project detail + members + knowledge tag
 * PATCH  /api/v1/admin/projects/:id   — update scalars and/or reassign the lead
 * DELETE /api/v1/admin/projects/:id   — archive (soft; `status='archived'`)
 *
 * Fork-owned (f-project-admin, feature 05). DELETE is an **archive**, not a
 * hard delete — hard-deleting a project would cascade its features/tasks/members
 * (v1 keeps deletes reversible).
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getClientIP } from '@/lib/security/ip';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { getProjectDetail, updateProject, archiveProject } from '@/lib/projects/admin';
import { updateProjectSchema } from '@/lib/validations/project-admin';

function parseProjectId(raw: string): string {
  const parsed = cuidSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Invalid project id', { id: ['Must be a valid CUID'] });
  }
  return parsed.data;
}

export const GET = withAdminAuth<{ id: string }>(async (request, _session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseProjectId(rawId);

  const project = await getProjectDetail(id);

  log.info('Project fetched', { projectId: id });
  return successResponse(project);
});

export const PATCH = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseProjectId(rawId);

  const body = await validateRequestBody(request, updateProjectSchema);
  const project = await updateProject(id, body, {
    userId: session.user.id,
    clientIp: getClientIP(request),
  });

  log.info('Project updated', { projectId: id, adminId: session.user.id });
  return successResponse(project);
});

export const DELETE = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseProjectId(rawId);

  const project = await archiveProject(id, {
    userId: session.user.id,
    clientIp: getClientIP(request),
  });

  log.info('Project archived', { projectId: id, adminId: session.user.id });
  return successResponse(project);
});
