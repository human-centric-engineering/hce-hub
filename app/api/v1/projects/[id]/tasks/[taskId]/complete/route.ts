/**
 * Consumer — complete a task (task sheet action row)
 *
 * POST /api/v1/projects/:id/tasks/:taskId/complete — move the task to `merged`
 * (from `claimed` or `active`) and close its active-work claim. The HTTP face of
 * the shared `completeTask()` core (f-status-model §20 t-1); `f-github-sync` will
 * later drive the same core automatically on PR-merge.
 *
 * Fork-owned. Auth + the automatic per-section write cap come from `withAuth`;
 * `completeTask` routes through the [[f-access]] funnel, so a **non-member,
 * unknown id, or a task in another project is a 404, never a 403**.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { completeTask } from '@/lib/projects/task-actions';

export const POST = withAuth<{ id: string; taskId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, taskId: rawTaskId } = await params;
    const id = parseCuidParam(rawId);
    const taskId = parseCuidParam(rawTaskId);

    // `id` scopes the task to this project (no cross-project id-swap).
    const result = await completeTask(session.user.id, taskId, id);

    log.info('Task completed', {
      userId: session.user.id,
      projectId: id,
      taskId,
    });
    return successResponse(result);
  }
);
