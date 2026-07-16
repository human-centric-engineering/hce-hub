/**
 * Consumer — claim a task (task sheet action row)
 *
 * POST /api/v1/projects/:id/tasks/:taskId/claim — mark the task claimed by the
 * caller and return soft collision warnings (never a hard lock, §5). The HTTP
 * face of the same `claimTask()` core the `claim_task` MCP/chat capability runs,
 * so the two never drift.
 *
 * Fork-owned (f-task-sheet §11 t-3). Auth + the automatic per-section write cap
 * come from `withAuth`; `claimTask` routes through the [[f-access]] funnel, so a
 * **non-member, unknown id, or a task in another project is a 404, never a 403**.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { claimTask } from '@/lib/projects/claim-task-service';

export const POST = withAuth<{ id: string; taskId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, taskId: rawTaskId } = await params;
    const id = parseCuidParam(rawId);
    const taskId = parseCuidParam(rawTaskId);

    // `id` scopes the task to this project (no cross-project id-swap).
    const result = await claimTask(session.user.id, taskId, id);

    log.info('Task claimed', {
      userId: session.user.id,
      projectId: id,
      taskId,
      warnings: result.warnings.length,
    });
    return successResponse(result);
  }
);
