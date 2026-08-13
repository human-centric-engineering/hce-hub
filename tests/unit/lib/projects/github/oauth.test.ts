/**
 * Tests for `lib/projects/github/oauth.ts` — the fork-owned GitHub OAuth linking
 * client (f-github-identity §23 t-74). Pins the least-privilege authorize URL (no
 * scope), the configured gate, and the two network steps' success + failure
 * handling — including GitHub's 200-with-`{error}` bad-code response, which
 * `res.ok` alone would miss.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  env: {
    GITHUB_CLIENT_ID: 'client-id',
    GITHUB_CLIENT_SECRET: 'client-secret',
    BETTER_AUTH_URL: 'https://hub.example',
  },
}));

const { env } = await import('@/lib/env');
const {
  githubOAuthConfigured,
  githubStateCookieSecure,
  githubCallbackUrl,
  buildGithubAuthorizeUrl,
  exchangeGithubCode,
  fetchGithubUser,
} = await import('@/lib/projects/github/oauth');

const mutableEnv = env as unknown as Record<string, string | undefined>;
const originalId = mutableEnv.GITHUB_CLIENT_ID;
const originalSecret = mutableEnv.GITHUB_CLIENT_SECRET;
const originalBaseUrl = mutableEnv.BETTER_AUTH_URL;

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function errStatus(status: number) {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

beforeEach(() => {
  mutableEnv.GITHUB_CLIENT_ID = originalId;
  mutableEnv.GITHUB_CLIENT_SECRET = originalSecret;
  mutableEnv.BETTER_AUTH_URL = originalBaseUrl;
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('githubOAuthConfigured', () => {
  it('is true only when both credentials are set', () => {
    expect(githubOAuthConfigured()).toBe(true);
    mutableEnv.GITHUB_CLIENT_SECRET = undefined;
    expect(githubOAuthConfigured()).toBe(false);
    mutableEnv.GITHUB_CLIENT_ID = undefined;
    expect(githubOAuthConfigured()).toBe(false);
  });
});

describe('githubStateCookieSecure', () => {
  it('is true on an https base URL and false on plain http', () => {
    expect(githubStateCookieSecure()).toBe(true); // https://hub.example
    mutableEnv.BETTER_AUTH_URL = 'http://localhost:3012';
    expect(githubStateCookieSecure()).toBe(false);
  });
});

describe('URL construction', () => {
  it('builds the callback URL from BETTER_AUTH_URL', () => {
    expect(githubCallbackUrl()).toBe('https://hub.example/api/v1/users/me/github/callback');
  });

  it('builds an authorize URL with client_id, redirect_uri, state — and NO scope', () => {
    const url = new URL(buildGithubAuthorizeUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://hub.example/api/v1/users/me/github/callback'
    );
    expect(url.searchParams.get('state')).toBe('state-123');
    // Least privilege — no scope is requested.
    expect(url.searchParams.has('scope')).toBe(false);
  });
});

describe('exchangeGithubCode', () => {
  it('returns the access token on success', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okJson({ access_token: 'gho_tok' }));
    expect(await exchangeGithubCode('code')).toBe('gho_tok');
  });

  it('throws when GitHub returns 200 with no access_token (bad/expired code)', async () => {
    // GitHub answers a bad code with HTTP 200 + { error } — res.ok is not enough.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okJson({ error: 'bad_verification_code' })
    );
    await expect(exchangeGithubCode('code')).rejects.toThrow(/no access_token/);
  });

  it('throws on a non-ok response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errStatus(500));
    await expect(exchangeGithubCode('code')).rejects.toThrow(/token exchange failed: 500/);
  });
});

describe('fetchGithubUser', () => {
  it('maps id/login/avatar into the identity shape (numeric id → string)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okJson({ id: 583231, login: 'octocat', avatar_url: 'https://avatars.example/o.png' })
    );
    expect(await fetchGithubUser('tok')).toEqual({
      githubUserId: '583231',
      githubLogin: 'octocat',
      avatarUrl: 'https://avatars.example/o.png',
    });
  });

  it('normalises a missing avatar to null', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okJson({ id: 1, login: 'x' }));
    expect((await fetchGithubUser('tok')).avatarUrl).toBeNull();
  });

  it('tolerates a present-but-non-URL avatar (empty string → null), still linking', async () => {
    // A cosmetic bad avatar must not abort an otherwise-valid link.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okJson({ id: 7, login: 'x', avatar_url: '' })
    );
    const res = await fetchGithubUser('tok');
    expect(res).toEqual({ githubUserId: '7', githubLogin: 'x', avatarUrl: null });
  });

  it('throws on a malformed user payload (no id)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okJson({ login: 'x' }));
    await expect(fetchGithubUser('tok')).rejects.toThrow();
  });

  it('throws on a non-ok response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errStatus(401));
    await expect(fetchGithubUser('tok')).rejects.toThrow(/\/user request failed: 401/);
  });

  it('sends a User-Agent and bearer token (GitHub rejects UA-less requests)', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(okJson({ id: 1, login: 'x' }));
    await fetchGithubUser('tok');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['User-Agent']).toBeTruthy();
    expect(headers.Authorization).toBe('Bearer tok');
  });
});
