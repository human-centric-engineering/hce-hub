/**
 * Consumer — the project's idea inbox
 *
 * GET  /api/v1/projects/:id/ideas — the actionable ideas (open + dropped) the
 *   inbox renders in one request (no N+1); the HTTP face of `getProjectIdeas()`.
 * POST /api/v1/projects/:id/ideas — jot a line; it lands as an `Idea` in the
 *   project's inbox, to triage later. The HTTP face of `captureIdea()`; the
 *   `capture_idea` MCP capability is the other write face.
 *
 * Fork-owned. Auth comes from `withAuth`; the automatic per-section caps are
 * applied by the security middleware (`proxy.ts`), not the guard. The POST body
 * is validated at this boundary. Both route through the [[f-access]] funnel, so a
 * **non-member or unknown project is a 404, never a 403**.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { captureIdea } from '@/lib/projects/capture-idea-service';
import { getProjectIdeas } from '@/lib/projects/ideas';
import { IDEA_TEXT_MAX } from '@/lib/projects/idea-constants';

export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const inbox = await getProjectIdeas(session.user.id, id);

  log.info('Project ideas fetched', { userId: session.user.id, projectId: id });
  return successResponse(inbox);
});

const bodySchema = z.object({ text: z.string().trim().min(1).max(IDEA_TEXT_MAX) });

export const POST = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(`An idea (1–${IDEA_TEXT_MAX} characters) is required.`, {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  const result = await captureIdea(session.user.id, id, parsed.data.text);

  log.info('Idea captured', {
    userId: session.user.id,
    projectId: id,
    ideaId: result.ideaId,
  });
  return successResponse(result);
});
