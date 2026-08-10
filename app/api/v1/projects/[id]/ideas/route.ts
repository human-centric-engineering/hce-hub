/**
 * Consumer — capture an idea (the quick-jot affordance)
 *
 * POST /api/v1/projects/:id/ideas — jot a line; it lands as an indicative feature
 * stub in the project's parked phase (the Ideas Park). The HTTP face of the shared
 * `captureIdea()` core (f-idea-capture §22-03 t-58); the `capture_idea` MCP
 * capability is the other face. The quick-jot UI (t-59) POSTs here.
 *
 * Fork-owned. Auth + the automatic per-section write cap come from `withAuth`; the
 * body is validated at this boundary. `captureIdea` routes through the [[f-access]]
 * funnel, so a **non-member or unknown project is a 404, never a 403**; a project
 * with no parked phase is a 400 (`ValidationError`, mapped by `handleAPIError`).
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { captureIdea } from '@/lib/projects/capture-idea-service';

const bodySchema = z.object({ text: z.string().trim().min(1).max(500) });

export const POST = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('An idea (1–500 characters) is required.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  const result = await captureIdea(session.user.id, id, parsed.data.text);

  log.info('Idea captured', {
    userId: session.user.id,
    projectId: id,
    featureId: result.featureId,
  });
  return successResponse(result);
});
