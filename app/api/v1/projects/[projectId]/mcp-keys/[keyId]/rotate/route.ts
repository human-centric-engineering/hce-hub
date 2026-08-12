/**
 * Member self-service MCP keys — rotate (f-mcp-project-scope §31 t-C).
 *
 * POST /api/v1/projects/:projectId/mcp-keys/:keyId/rotate — fresh material,
 * the old secret is invalidated immediately; new plaintext returned once.
 *
 * Body (optional): { expiresAt?: ISO date | null }.
 *
 * Fork-owned, member-facing. The service enforces ownership + project scope
 * (not-yours / wrong-project / unknown ⇒ 404, anti-enumeration).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { cuidSchema } from '@/lib/validations/common';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { rotateProjectMcpKey, projectMcpKeyRotateSchema } from '@/lib/projects/mcp-keys';

export const POST = withAuth<{ projectId: string; keyId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const clientIP = getClientIP(request);
    const { projectId, keyId } = await params;
    cuidSchema.parse(keyId);

    const body = await validateRequestBody(request, projectMcpKeyRotateSchema);
    const { key, plaintext, previousPrefix } = await rotateProjectMcpKey(
      session.user.id,
      projectId,
      keyId,
      body
    );

    log.info('Project MCP key rotated', {
      userId: session.user.id,
      projectRef: projectId,
      keyId: key.id,
      previousPrefix,
      newPrefix: key.keyPrefix,
    });

    logAdminAction({
      userId: session.user.id,
      action: 'mcp_api_key.rotate',
      entityType: 'mcp_api_key',
      entityId: key.id,
      entityName: key.name,
      metadata: { previousPrefix, newPrefix: key.keyPrefix, projectScoped: true },
      clientIp: clientIP,
    });

    // Plaintext returned ONCE — never stored or logged.
    return successResponse({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      scope: key.scope,
      expiresAt: key.expiresAt,
      plaintext,
    });
  }
);
