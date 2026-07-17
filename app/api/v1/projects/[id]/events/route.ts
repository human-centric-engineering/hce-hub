/**
 * Consumer — project journal events
 *
 * GET /api/v1/projects/:id/events — the membership-scoped `ProjectEvent` stream
 * behind every log surface: the task-sheet activity timeline (`?taskId=`), a
 * feature's activity (`?featureId=`), and the project Log tab (`?kinds=` —
 * comma-separated, e.g. `decision` or `feature_shipped,task_merged`). Newest
 * first, capped at `PROJECT_EVENT_LIMIT`.
 *
 * Fork-owned (f-journal §17 t-3). Routes through `getProjectEvents` →
 * `getAccessibleProject`, so a **non-member or unknown project is a 404, never a
 * 403**. Query filters are scoped to the confirmed project, so a `taskId` /
 * `featureId` from another project simply matches nothing (no cross-project
 * read). Unknown `kinds` values are ignored (a lenient read filter).
 */
import { ProjectEventKind } from '@prisma/client';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { parseCuidParam } from '@/lib/api/route-params';
import { getProjectEvents } from '@/lib/projects/journal';

const KIND_VALUES = new Set<string>(Object.values(ProjectEventKind));

export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId') ?? undefined;
  const featureId = searchParams.get('featureId') ?? undefined;
  const kindsParam = searchParams.get('kinds');
  // Keep only recognised kinds — an unknown value is a no-op filter, not a 400.
  const kinds = kindsParam
    ? kindsParam.split(',').filter((k): k is ProjectEventKind => KIND_VALUES.has(k))
    : undefined;

  const events = await getProjectEvents(session.user.id, id, { taskId, featureId, kinds });

  log.info('Project events fetched', {
    userId: session.user.id,
    projectId: id,
    count: events.length,
  });
  return successResponse(events);
});
