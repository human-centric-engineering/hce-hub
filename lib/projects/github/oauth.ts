/**
 * GitHub OAuth *linking* flow (f-github-identity §23 t-74).
 *
 * A small, fork-owned OAuth client used purely to **link** a signed-in Hub user
 * to their GitHub identity — deliberately NOT a better-auth social sign-in
 * provider (that would open a signup path in an invite-only app and force a core
 * `lib/auth/config.ts` edit). The flow:
 *
 *   connect  → redirect the user to GitHub with a random `state`
 *   callback → verify `state`, exchange the `code` for a token, read `/user`,
 *              persist { id, login, avatar } via the identity service, then
 *              **discard the token** — the Hub never calls GitHub again for this
 *              user (attribution comes from inbound webhooks), so nothing
 *              credential-bearing is stored.
 *
 * Least privilege: no `scope` is requested. `GET /user` returns the public id +
 * login + avatar for an unscoped token, which is all the mapping needs.
 *
 * @see app/api/v1/users/me/github/** — the routes that drive this
 * @see lib/projects/github/identity.ts — where the resolved identity is stored
 */
import { z } from 'zod';
import { env } from '@/lib/env';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_FETCH_TIMEOUT_MS = 10_000;

/** Cookie carrying the CSRF `state` between `connect` and `callback`. */
export const GITHUB_OAUTH_STATE_COOKIE = 'hub_github_oauth_state';

/** Both client credentials present → the linking flow is enabled (else dormant, 503). */
export function githubOAuthConfigured(): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

/**
 * Whether the CSRF state cookie should carry `Secure` — true only when the base
 * URL is https. On a plain-http origin a `Secure` cookie is silently dropped by
 * the browser, which would break the round-trip with no diagnostic; gate it so a
 * self-hosted/preview http deployment still works.
 */
export function githubStateCookieSecure(): boolean {
  return env.BETTER_AUTH_URL.startsWith('https://');
}

/** The callback URL — must match the one registered on the GitHub OAuth app. */
export function githubCallbackUrl(): string {
  return `${env.BETTER_AUTH_URL}/api/v1/users/me/github/callback`;
}

/** The GitHub authorize URL to redirect the user to (no scopes — least privilege). */
export function buildGithubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID ?? '',
    redirect_uri: githubCallbackUrl(),
    state,
    // No `scope`: an unscoped token still reads the public id/login/avatar via
    // GET /user, which is all we persist. Don't request access we won't use.
    allow_signup: 'false',
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

const tokenResponseSchema = z.object({ access_token: z.string().min(1) });

/**
 * Exchange an authorization `code` for an access token. GitHub returns HTTP 200
 * with an `{ error }` body for a bad/expired/replayed code, so success is decided
 * by the presence of `access_token`, not the status alone.
 */
export async function exchangeGithubCode(code: string): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: githubCallbackUrl(),
    }),
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: ${res.status}`);
  }
  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error('GitHub token exchange returned no access_token');
  }
  return parsed.data.access_token;
}

const githubUserSchema = z.object({
  id: z.number().int(),
  login: z.string().min(1),
  // Cosmetic — a present-but-non-URL avatar (e.g. an empty string) must NOT abort
  // an otherwise-valid link, so fall back to null rather than throwing.
  avatar_url: z.string().url().nullish().catch(null),
});

/** The verified GitHub identity, in the shape the identity service persists. */
export interface GithubUserIdentity {
  githubUserId: string;
  githubLogin: string;
  avatarUrl: string | null;
}

/** Read the authenticated GitHub user's public identity (id + login + avatar). */
export async function fetchGithubUser(token: string): Promise<GithubUserIdentity> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      // GitHub's API rejects requests with no User-Agent (403).
      'User-Agent': 'hce-hub',
    },
    signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GitHub /user request failed: ${res.status}`);
  }
  const user = githubUserSchema.parse(await res.json());
  return {
    githubUserId: String(user.id),
    githubLogin: user.login,
    avatarUrl: user.avatar_url ?? null,
  };
}
