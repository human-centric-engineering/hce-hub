/**
 * Current user's GitHub identity link (f-github-identity §23 t-74).
 *
 * GET    /api/v1/users/me/github — the caller's link state (no secret; none is stored)
 * DELETE /api/v1/users/me/github — unlink the caller's GitHub identity
 *
 * The OAuth round-trip that CREATES the link lives in `./connect` + `./callback`.
 * Auth + rate limiting via `withAuth`.
 */
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { getGithubIdentity, disconnectGithubIdentity } from '@/lib/projects/github/identity';
import { githubOAuthConfigured } from '@/lib/projects/github/oauth';

export const GET = withAuth(async (_request, session) => {
  const identity = await getGithubIdentity(session.user.id);
  return successResponse({
    connected: identity !== null,
    githubLogin: identity?.githubLogin ?? null,
    avatarUrl: identity?.avatarUrl ?? null,
    connectedAt: identity?.connectedAt ?? null,
    // Lets the UI show "linking unavailable" when the deployment hasn't set the
    // OAuth app up, instead of offering a Connect button that 503s.
    configured: githubOAuthConfigured(),
  });
});

export const DELETE = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  await disconnectGithubIdentity(session.user.id);
  log.info('GitHub identity unlinked', { userId: session.user.id });
  return successResponse({ connected: false });
});
