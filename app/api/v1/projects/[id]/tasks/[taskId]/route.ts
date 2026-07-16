/**
 * Consumer — single task detail (task sheet)
 *
 * GET /api/v1/projects/:id/tasks/:taskId — one task's full detail (description,
 * file scope, effective status, claimer, PR, and its two-way dependency graph)
 * for the deep-linkable task sheet. The single enriched read the sheet renders.
 *
 * Fork-owned (f-task-sheet, feature 11). Routes through `getTaskDetail` →
 * `getAccessibleProject`, so a **non-member, unknown id, or a task in another
 * project is a 404, never a 403** (anti-enumeration + no cross-project id-swap).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { getTaskDetail } from '@/lib/projects/task-detail';

export const GET = withAuth<{ id: string; taskId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, taskId: rawTaskId } = await params;
    const id = parseCuidParam(rawId);
    const taskId = parseCuidParam(rawTaskId);

    const task = await getTaskDetail(session.user.id, id, taskId);

    log.info('Task detail fetched', { userId: session.user.id, projectId: id, taskId });
    return successResponse(task);
  }
);
