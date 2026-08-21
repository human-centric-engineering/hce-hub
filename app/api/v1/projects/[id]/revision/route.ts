/**
 * Consumer — project revision (change cursor)
 *
 * GET /api/v1/projects/:id/revision — an opaque token that changes iff anything
 * in the project changed. The polling half of live surfaces (f-realtime §36
 * t-125): a client hands back the token it holds as `If-None-Match` and gets a
 * 304 while nothing has moved, or a fresh token when something has.
 *
 * Fork-owned. Routes through `getProjectRevision` → `requireProjectAccess`, so a
 * **non-member or unknown id is a 404, never a 403** (anti-enumeration).
 *
 * Rate-limited by `proxy.ts` on its own **`hub-revision`** tier — not the shared
 * `api` one — registered from `lib/app/rate-limit.ts`. That is the whole reason the
 * tier exists: on `api` this route would spend the single 100/min budget every
 * other `/api/v1` call of the same user draws on, so polling would make ordinary
 * writes 429. Still no handler-level limiter, which the repo forbids and which
 * would double-count against the same tier.
 *
 * **Deliberately does not log a successful read.** Every other consumer route
 * `log.info`s its fetch, and that is right for a route hit when a human opens a
 * page. This one is hit every few seconds by every open tab, so an info line per
 * request would outnumber all other application logging combined and bury the
 * events anyone actually reads. Failures still surface — they throw, and the
 * error path logs them.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { checkConditional } from '@/lib/api/etag';
import { parseCuidParam } from '@/lib/api/route-params';
import { getProjectRevision } from '@/lib/projects/revision';

export const GET = withAuth<{ id: string }>(async (request, session, { params }) => {
  const { id: rawId } = await params;
  const id = parseCuidParam(rawId);

  const revision = await getProjectRevision(session.user.id, id);

  // The token IS the ETag, so the 200 and the 304 cannot describe different
  // states of the project.
  const notModified = checkConditional(request, revision.revision);
  if (notModified) return notModified;

  return successResponse(revision, undefined, { headers: { ETag: revision.revision } });
});
