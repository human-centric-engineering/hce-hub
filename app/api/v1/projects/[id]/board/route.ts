/**
 * Consumer — Project Board view (Kanban)
 *
 * GET /api/v1/projects/:id/board — the project's tasks routed into member swim
 * lanes × effective-status columns, with soft-collision flags. The single
 * enriched read the Board renders (no N+1).
 *
 * Fork-owned (f-board-view, feature 10). Routes through `getProjectBoard` →
 * `getAccessibleProject`, so a **non-member or unknown id is a 404, never a 403**
 * (anti-enumeration).
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { getProjectBoard } from '@/lib/projects/board';

export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const board = await getProjectBoard(session.user.id, id);

  log.info('Project board fetched', { userId: session.user.id, projectId: id });
  return successResponse(board);
});
