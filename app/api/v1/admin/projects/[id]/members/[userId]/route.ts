/**
 * Admin — Project member (remove)
 *
 * DELETE /api/v1/admin/projects/:id/members/:userId   — remove a member
 *
 * Fork-owned (f-project-admin, feature 05). Refuses (409) to remove the current
 * lead — the lead is resolved from their `ProjectMember` row, so stripping it
 * would revoke their own access; reassign the lead first.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { parseCuidParam } from '@/lib/api/route-params';
import { getClientIP } from '@/lib/security/ip';
import { getRouteLogger } from '@/lib/api/context';
import { removeMember } from '@/lib/projects/admin';

export const DELETE = withAdminAuth<{ id: string; userId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, userId } = await params;
    const projectId = parseCuidParam(rawId);

    await removeMember(projectId, userId, {
      userId: session.user.id,
      clientIp: getClientIP(request),
    });

    log.info('Project member removed', { projectId, userId, adminId: session.user.id });
    return successResponse({ projectId, userId });
  }
);
