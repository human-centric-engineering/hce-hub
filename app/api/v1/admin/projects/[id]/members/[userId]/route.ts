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
import { ValidationError } from '@/lib/api/errors';
import { getClientIP } from '@/lib/security/ip';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { removeMember } from '@/lib/projects/admin';

function parseProjectId(raw: string): string {
  const parsed = cuidSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError('Invalid project id', { id: ['Must be a valid CUID'] });
  }
  return parsed.data;
}

export const DELETE = withAdminAuth<{ id: string; userId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, userId } = await params;
    const projectId = parseProjectId(rawId);

    await removeMember(projectId, userId, {
      userId: session.user.id,
      clientIp: getClientIP(request),
    });

    log.info('Project member removed', { projectId, userId, adminId: session.user.id });
    return successResponse({ projectId, userId });
  }
);
