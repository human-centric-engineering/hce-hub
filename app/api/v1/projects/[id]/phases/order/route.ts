/**
 * Consumer — reorder a project's phases (f-phases §22 t3)
 *
 * PUT /api/v1/projects/:id/phases/order — set the phase order in one shot: the
 * body carries the complete list of the project's phase ids in the desired order
 * (`{ phaseIds: [...] }`) and the service reassigns ordinals 0..n-1 in a
 * transaction. **Batch by design** — collision-free, matches drag-to-reorder.
 *
 * `order` is a static segment so it resolves ahead of the `[phaseId]` route.
 * Fork-owned. Auth + the automatic cap come from `withAuth`; `reorderPhases` routes
 * through the [[f-access]] funnel (`member` tier), so a non-member / unknown id is a
 * **404, never 403**. An incomplete list (not exactly the project's phases) → 400.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { reorderPhases } from '@/lib/projects/phases-service';

const orderSchema = z.object({
  phaseIds: z.array(z.string()).min(1).max(200),
});

export const PUT = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('A non-empty phaseIds array is required.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  const result = await reorderPhases(session.user.id, id, parsed.data.phaseIds);

  log.info('Phases reordered', { userId: session.user.id, projectId: id, count: result.count });
  return successResponse(result);
});
