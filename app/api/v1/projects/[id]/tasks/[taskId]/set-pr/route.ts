/**
 * Consumer — link a task to its pull request (task sheet action)
 *
 * POST /api/v1/projects/:id/tasks/:taskId/set-pr — set/replace the task's PR URL
 * and journal `task_pr_linked`. **No status change** (linking a PR is not merging
 * it — f-github-sync §14 t-1). The HTTP face of the shared `setTaskPr()` core.
 *
 * Fork-owned. Auth + the automatic per-section write cap come from `withAuth`; the
 * body is validated at this boundary (a well-formed http(s) URL). `setTaskPr`
 * routes through the [[f-access]] funnel, so a **non-member, unknown id, or a task
 * in another project is a 404, never a 403**.
 */
import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { setTaskPr } from '@/lib/projects/task-actions';

const bodySchema = z.object({
  prUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'PR URL must be an http(s) URL.'),
});

export const POST = withAuth<{ id: string; taskId: string }>(
  async (request, session, { params }) => {
    const log = await getRouteLogger(request);
    const { id: rawId, taskId: rawTaskId } = await params;
    const id = parseCuidParam(rawId);
    const taskId = parseCuidParam(rawTaskId);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse('A valid http(s) PR URL is required.', {
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }

    // `id` scopes the task to this project (no cross-project id-swap).
    const result = await setTaskPr(session.user.id, taskId, parsed.data.prUrl, id);

    log.info('Task PR linked', { userId: session.user.id, projectId: id, taskId });
    return successResponse(result);
  }
);
