/**
 * Consumer — (re)assign a task (task sheet assignee picker)
 *
 * PATCH /api/v1/projects/:id/tasks/:taskId/assignee — set the task's assignee to a
 * project member and return soft handoff warnings (never a hard lock, §5). The
 * HTTP face of the shared `assignTask()` core (f-task-assignment §22 t2); the MCP
 * `assign_task` capability is the other face of the same core.
 *
 * Fork-owned. Auth + the automatic per-section write cap come from `withAuth`; the
 * body is validated at this boundary (a cuid `assigneeUserId`). `assignTask` routes
 * through the [[f-access]] funnel, so a **non-member caller, unknown id, or a task
 * in another project is a 404, never a 403**; an assignee who isn't a member of the
 * project is a 400 (`ValidationError`, mapped by `handleAPIError`).
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { cuidSchema } from '@/lib/validations/common';
import { assignTask } from '@/lib/projects/task-actions';

const bodySchema = z.object({ assigneeUserId: cuidSchema });

export const PATCH = withAuth<{ id: string; taskId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, taskId: rawTaskId } = await params;
    const id = parseCuidParam(rawId);
    const taskId = parseCuidParam(rawTaskId);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse('A valid assignee id is required.', {
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    // `id` scopes the task to this project (no cross-project id-swap).
    const result = await assignTask(session.user.id, taskId, parsed.data.assigneeUserId, id);

    log.info('Task assigned', {
      userId: session.user.id,
      projectId: id,
      taskId,
      warnings: result.warnings.length,
    });
    return successResponse(result);
  }
);
