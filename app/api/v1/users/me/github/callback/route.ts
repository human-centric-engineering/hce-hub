/**
 * Complete the GitHub linking flow (f-github-identity §23 t-74).
 *
 * GET /api/v1/users/me/github/callback?code&state — verify the CSRF `state`,
 * exchange the `code` for a token, read the GitHub identity, persist it, DISCARD
 * the token, and redirect back to settings. Every exit clears the state cookie.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guards';
import { errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { ConflictError } from '@/lib/api/errors';
import { env } from '@/lib/env';
import {
  GITHUB_OAUTH_STATE_COOKIE,
  exchangeGithubCode,
  fetchGithubUser,
  githubOAuthConfigured,
  githubStateCookieSecure,
} from '@/lib/projects/github/oauth';
import { upsertGithubIdentity } from '@/lib/projects/github/identity';

/** Redirect to the settings surface with a status the UI can surface, clearing state. */
function settingsRedirect(status: string): NextResponse {
  const url = new URL('/settings', env.BETTER_AUTH_URL);
  url.searchParams.set('github', status);
  const response = NextResponse.redirect(url);
  // Always clear the one-shot state cookie, whatever the outcome. Match the
  // `secure` attribute the connect route set it with, so the deletion is honoured.
  response.cookies.set(GITHUB_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: githubStateCookieSecure(),
    sameSite: 'lax',
    path: '/api/v1/users/me/github',
    maxAge: 0,
  });
  return response;
}

export const GET = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);

  if (!githubOAuthConfigured()) {
    return errorResponse('GitHub linking is not configured on this deployment.', {
      code: 'NOT_CONFIGURED',
      status: 503,
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const expectedState = (await cookies()).get(GITHUB_OAUTH_STATE_COOKIE)?.value;

  // The user declined on GitHub's consent screen (or GitHub reported an error).
  if (providerError) {
    log.info('GitHub linking was cancelled', { providerError });
    return settingsRedirect('cancelled');
  }

  // CSRF: the returned state must match the cookie set at connect time.
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    log.warn('GitHub linking rejected — missing code or state mismatch', {
      hasCode: Boolean(code),
      stateMatched: Boolean(expectedState) && returnedState === expectedState,
    });
    return settingsRedirect('error');
  }

  try {
    const token = await exchangeGithubCode(code);
    const identity = await fetchGithubUser(token);
    // The token has done its one job (reading the identity). It is deliberately
    // not persisted or returned — attribution comes from inbound webhooks.
    await upsertGithubIdentity(session.user.id, identity);
    log.info('GitHub identity linked', {
      userId: session.user.id,
      githubLogin: identity.githubLogin,
    });
    return settingsRedirect('connected');
  } catch (err) {
    if (err instanceof ConflictError) {
      // This GitHub account is already linked to a different Hub user.
      log.info('GitHub linking conflict — account already linked to another user', {
        userId: session.user.id,
      });
      return settingsRedirect('already-linked');
    }
    log.error('GitHub linking failed', err, { userId: session.user.id });
    return settingsRedirect('error');
  }
});
