/**
 * Start the GitHub linking flow (f-github-identity §23 t-74).
 *
 * GET /api/v1/users/me/github/connect — mint a CSRF `state`, drop it in a
 * short-lived cookie, and redirect the signed-in user to GitHub's authorize page.
 * 503 when the OAuth app isn't configured on this deployment.
 */
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guards';
import { errorResponse } from '@/lib/api/responses';
import {
  GITHUB_OAUTH_STATE_COOKIE,
  buildGithubAuthorizeUrl,
  githubOAuthConfigured,
  githubStateCookieSecure,
} from '@/lib/projects/github/oauth';

export const GET = withAuth(() => {
  if (!githubOAuthConfigured()) {
    return errorResponse('GitHub linking is not configured on this deployment.', {
      code: 'NOT_CONFIGURED',
      status: 503,
    });
  }

  const state = randomBytes(32).toString('hex');
  const response = NextResponse.redirect(buildGithubAuthorizeUrl(state));
  // HttpOnly + SameSite=Lax so the cookie survives GitHub's top-level GET
  // redirect back to the callback; scoped to the github route subtree, short TTL.
  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: githubStateCookieSecure(),
    sameSite: 'lax',
    path: '/api/v1/users/me/github',
    maxAge: 600,
  });
  return response;
});
