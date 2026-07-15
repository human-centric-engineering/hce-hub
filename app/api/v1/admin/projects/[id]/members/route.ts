/**
 * Admin — Project members (add)
 *
 * POST /api/v1/admin/projects/:id/members   — add a member (role='member')
 *
 * Fork-owned (f-project-admin, feature 05). The member roster is returned by
 * `GET /api/v1/admin/projects/:id`; this route only mutates. The project lead
 * is managed via the project's `leadUserId` (PATCH the project), not here —
 * added members are always `role='member'` in v1.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { parseCuidParam } from '@/lib/api/route-params';
import { getClientIP } from '@/lib/security/ip';
import { getRouteLogger } from '@/lib/api/context';
import { addMember } from '@/lib/projects/admin';
import { addMemberSchema } from '@/lib/validations/project-admin';

export const POST = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const projectId = parseCuidParam(rawId);

  const { userId } = await validateRequestBody(request, addMemberSchema);
  await addMember(projectId, userId, {
    userId: session.user.id,
    clientIp: getClientIP(request),
  });

  log.info('Project member added', { projectId, userId, adminId: session.user.id });
  return successResponse({ projectId, userId }, undefined, { status: 201 });
});
