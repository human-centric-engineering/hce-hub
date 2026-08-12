/**
 * Member self-service MCP keys — collection (f-mcp-project-scope §31 t-C).
 *
 * GET  /api/v1/projects/:projectId/mcp-keys — the caller's own keys for the project
 * POST /api/v1/projects/:projectId/mcp-keys — mint one (plaintext returned once)
 *
 * Fork-owned, member-facing (`withAuth`, not `withAdminAuth`): any project member
 * may manage their OWN project-scoped keys. The scope + scopes are forced by the
 * service — a member never chooses them. `:projectId` is a slug or cuid, resolved
 * through the membership funnel (non-member / unknown ⇒ 404, anti-enumeration).
 * Rate limiting is the automatic `/api/v1/**` section cap (proxy.ts).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import {
  listProjectMcpKeys,
  createProjectMcpKey,
  projectMcpKeyCreateSchema,
} from '@/lib/projects/mcp-keys';

export const GET = withAuth<{ projectId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { projectId } = await params;

  const keys = await listProjectMcpKeys(session.user.id, projectId);

  log.info('Project MCP keys listed', {
    userId: session.user.id,
    projectRef: projectId,
    count: keys.length,
  });
  return successResponse({ keys });
});

export const POST = withAuth<{ projectId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const clientIP = getClientIP(request);
  const { projectId } = await params;

  const body = await validateRequestBody(request, projectMcpKeyCreateSchema);
  const { key, plaintext } = await createProjectMcpKey(session.user.id, projectId, body);

  log.info('Project MCP key created', {
    userId: session.user.id,
    projectRef: projectId,
    keyId: key.id,
    keyPrefix: key.keyPrefix,
  });

  logAdminAction({
    userId: session.user.id,
    action: 'mcp_api_key.create',
    entityType: 'mcp_api_key',
    entityId: key.id,
    entityName: key.name,
    metadata: { keyPrefix: key.keyPrefix, scopes: key.scopes, projectScoped: true },
    clientIp: clientIP,
  });

  // Plaintext is returned ONCE — it can never be retrieved again.
  return successResponse(
    {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      scope: key.scope,
      expiresAt: key.expiresAt,
      plaintext,
    },
    undefined,
    { status: 201 }
  );
});
