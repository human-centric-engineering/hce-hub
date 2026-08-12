/**
 * Member self-service MCP keys — one key (f-mcp-project-scope §31 t-C).
 *
 * DELETE /api/v1/projects/:projectId/mcp-keys/:keyId — revoke (delete) your key
 *
 * Fork-owned, member-facing. The service enforces ownership + project scope, so a
 * member can only revoke a key they created that is scoped to this project;
 * anything else is `not_found` (uniform, anti-enumeration).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { cuidSchema } from '@/lib/validations/common';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { revokeProjectMcpKey } from '@/lib/projects/mcp-keys';

export const DELETE = withAuth<{ projectId: string; keyId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const clientIP = getClientIP(request);
    const { projectId, keyId } = await params;
    cuidSchema.parse(keyId);

    const revoked = await revokeProjectMcpKey(session.user.id, projectId, keyId);

    log.info('Project MCP key revoked', {
      userId: session.user.id,
      projectRef: projectId,
      keyId: revoked.id,
      keyPrefix: revoked.keyPrefix,
    });

    logAdminAction({
      userId: session.user.id,
      action: 'mcp_api_key.delete',
      entityType: 'mcp_api_key',
      entityId: revoked.id,
      entityName: revoked.name,
      metadata: { keyPrefix: revoked.keyPrefix, projectScoped: true },
      clientIp: clientIP,
    });

    return successResponse({ id: revoked.id, revoked: true });
  }
);
