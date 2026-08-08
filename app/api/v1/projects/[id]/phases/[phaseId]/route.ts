/**
 * Consumer — edit a phase (f-phases §22 t3)
 *
 * PATCH /api/v1/projects/:id/phases/:phaseId — rename, edit description, change
 * status (upcoming → active → complete, or park), or move it (ordinal). Partial
 * patch — only supplied fields change; a null description clears it. At least one
 * field is required.
 *
 * Fork-owned. Auth + the automatic cap come from `withAuth`. `updatePhase` routes
 * through the [[f-access]] funnel (`member` tier) and is scoped to `:id`, so a
 * non-member, unknown id, or a phase in another project is a **404, never 403**.
 * The HTTP face of the `update_phase` MCP capability's core.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { updatePhase } from '@/lib/projects/phases-service';

// No `ordinal` here on purpose — order is changed only via the batch reorder
// (`PUT …/phases/order`), which rewrites the whole dense `0..n-1` sequence and
// can't collide. A raw per-phase ordinal would be a collision side-door around it
// (there is no `@@unique(projectId, ordinal)`).
const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  status: z.enum(['upcoming', 'active', 'complete', 'parked']).optional(),
});

export const PATCH = withAuth<{ id: string; phaseId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, phaseId: rawPhaseId } = await params;
    const id = parseCuidParam(rawId);
    const phaseId = parseCuidParam(rawPhaseId);

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse('Invalid phase update.', { code: 'VALIDATION_ERROR', status: 400 });
    }

    // `id` scopes the phase to this project (no cross-project id-swap). A
    // `nothing_to_update` empty patch surfaces as ValidationError → 400.
    const result = await updatePhase(
      session.user.id,
      phaseId,
      {
        name: parsed.data.name,
        description: parsed.data.description,
        status: parsed.data.status,
      },
      id
    );

    log.info('Phase updated', { userId: session.user.id, projectId: id, phaseId });
    return successResponse(result);
  }
);
