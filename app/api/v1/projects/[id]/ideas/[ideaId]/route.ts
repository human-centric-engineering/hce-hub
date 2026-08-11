/**
 * Consumer — edit / drop / restore an idea
 *
 * PATCH /api/v1/projects/:id/ideas/:ideaId — refine an idea's text and/or move it
 * between `open` and `dropped` (a dropped idea is a retained, browseable archive).
 * The HTTP face of the shared `updateIdea()` core (f-idea-capture §22); the
 * `update_idea` MCP capability is the other face. The Ideas inbox UI PATCHes here.
 *
 * Promotion (idea → feature/task/phase/bug) is NOT here — it's the create verbs'
 * `fromIdeaId`, capability-mediated (Claude Code / the sidekick), per the journal.
 *
 * Fork-owned. Auth + the automatic per-section write cap come from `withAuth` /
 * the security middleware. `updateIdea` routes through the [[f-access]] funnel, so
 * a **non-member or unknown idea is a 404, never a 403**; a promoted idea (terminal)
 * or an empty patch is a 400.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { updateIdea } from '@/lib/projects/update-idea-service';

const bodySchema = z
  .object({
    text: z.string().trim().min(1).max(500).optional(),
    status: z.enum(['open', 'dropped']).optional(),
  })
  .refine((v) => v.text !== undefined || v.status !== undefined, {
    message: 'Provide a new text and/or status.',
  });

export const PATCH = withAuth<{ id: string; ideaId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, ideaId: rawIdeaId } = await params;
    const projectId = parseCuidParam(rawId);
    const ideaId = parseCuidParam(rawIdeaId);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse('Provide a new text (1–500 chars) and/or status (open|dropped).', {
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    const result = await updateIdea(session.user.id, ideaId, parsed.data, projectId);

    log.info('Idea updated', {
      userId: session.user.id,
      projectId,
      ideaId,
      status: result.status,
    });
    return successResponse({ ideaId: result.ideaId, status: result.status });
  }
);
