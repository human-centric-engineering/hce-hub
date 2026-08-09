/**
 * Consumer — reassign a feature's remaining tasks (feature page action)
 *
 * PATCH /api/v1/projects/:id/features/:key/assignee — hand the feature's remaining
 * (unmerged) tasks to a project member and return soft handoff warnings (never a
 * hard lock, §5). The HTTP face of the shared `reassignFeatureTasks()` core
 * (f-task-assignment §22 t2); the MCP `reassign_feature_tasks` capability is the
 * other face of the same core. **Merged tasks are untouched** (doer credit) and
 * `Feature.ownerUserId` is **never** changed — this moves the tasks, not the feature.
 *
 * Fork-owned. Auth + the automatic per-section write cap come from `withAuth`; the
 * body is validated at this boundary (a cuid `assigneeUserId`). `reassignFeatureTasks`
 * routes through the [[f-access]] funnel, so a **non-member caller, unknown id, or a
 * feature in another project is a 404, never a 403**; an assignee who isn't a member
 * is a 400 (`ValidationError`). `key` is the feature's cuid `id` here.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { cuidSchema } from '@/lib/validations/common';
import { reassignFeatureTasks } from '@/lib/projects/task-actions';

const bodySchema = z.object({ assigneeUserId: cuidSchema });

export const PATCH = withAuth<{ id: string; key: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId, key: rawKey } = await params;
  const id = parseCuidParam(rawId);
  const featureId = parseCuidParam(rawKey);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('A valid assignee id is required.', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  // `id` scopes the feature to this project (no cross-project id-swap).
  const result = await reassignFeatureTasks(
    session.user.id,
    featureId,
    parsed.data.assigneeUserId,
    id
  );

  log.info('Feature tasks reassigned', {
    userId: session.user.id,
    projectId: id,
    featureId,
    reassigned: result.reassigned,
    warnings: result.warnings.length,
  });
  return successResponse(result);
});
