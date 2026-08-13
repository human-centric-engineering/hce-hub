/**
 * Integration: the GitHub linking routes (f-github-identity §23 t-74).
 *
 * GET/DELETE /api/v1/users/me/github            — link state / unlink
 * GET        /api/v1/users/me/github/connect     — start OAuth (state cookie + redirect)
 * GET        /api/v1/users/me/github/callback     — verify state, persist, redirect
 *
 * Pins the security-relevant wiring: the 503 dormant gate, the CSRF state check
 * (mismatch never reaches the upsert), the token-is-used-then-discarded happy
 * path, and the already-linked conflict. `withAuth` is stubbed to inject a
 * session; its real 401 gate is covered by the shared guard tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, type NextResponse } from 'next/server';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: { value: undefined as string | undefined } }));

vi.mock('@/lib/auth/guards', () => ({
  withAuth:
    (handler: (req: NextRequest, session: unknown, ctx: unknown) => unknown) =>
    (req: NextRequest) =>
      handler(req, { user: { id: 'u1', email: 'u1@example.com' } }, {}),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (_name: string) =>
      cookieJar.value !== undefined ? { value: cookieJar.value } : undefined,
  })),
}));
vi.mock('@/lib/api/context', () => ({
  getRouteLogger: vi.fn(async () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));
vi.mock('@/lib/env', () => ({ env: { BETTER_AUTH_URL: 'https://hub.test' } }));
vi.mock('@/lib/projects/github/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/projects/github/oauth')>();
  return {
    ...actual, // keep the real GITHUB_OAUTH_STATE_COOKIE constant
    githubOAuthConfigured: vi.fn(() => true),
    buildGithubAuthorizeUrl: vi.fn(() => 'https://github.com/login/oauth/authorize?state=x'),
    exchangeGithubCode: vi.fn(),
    fetchGithubUser: vi.fn(),
  };
});
vi.mock('@/lib/projects/github/identity', () => ({
  getGithubIdentity: vi.fn(),
  disconnectGithubIdentity: vi.fn(),
  upsertGithubIdentity: vi.fn(),
}));

import {
  GITHUB_OAUTH_STATE_COOKIE,
  githubOAuthConfigured,
  exchangeGithubCode,
  fetchGithubUser,
} from '@/lib/projects/github/oauth';
import {
  getGithubIdentity,
  disconnectGithubIdentity,
  upsertGithubIdentity,
} from '@/lib/projects/github/identity';
import { ConflictError } from '@/lib/api/errors';
import { GET as linkGet, DELETE as linkDelete } from '@/app/api/v1/users/me/github/route';
import { GET as connectGet } from '@/app/api/v1/users/me/github/connect/route';
import { GET as callbackGet } from '@/app/api/v1/users/me/github/callback/route';

const configured = githubOAuthConfigured as ReturnType<typeof vi.fn>;
const exchange = exchangeGithubCode as ReturnType<typeof vi.fn>;
const fetchUser = fetchGithubUser as ReturnType<typeof vi.fn>;
const getIdentity = getGithubIdentity as ReturnType<typeof vi.fn>;
const disconnect = disconnectGithubIdentity as ReturnType<typeof vi.fn>;
const upsert = upsertGithubIdentity as ReturnType<typeof vi.fn>;

const req = (path: string) => new NextRequest(`https://hub.test${path}`);

beforeEach(() => {
  vi.clearAllMocks();
  configured.mockReturnValue(true);
  cookieJar.value = undefined;
});

describe('GET /connect', () => {
  it('503s when the OAuth app is not configured', async () => {
    configured.mockReturnValue(false);
    const res = await connectGet(req('/api/v1/users/me/github/connect'));
    expect(res.status).toBe(503);
  });

  it('redirects to GitHub and sets a random state cookie', async () => {
    const res = (await connectGet(req('/api/v1/users/me/github/connect'))) as NextResponse;
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('github.com/login/oauth/authorize');
    const stateCookie = res.cookies.get(GITHUB_OAUTH_STATE_COOKIE);
    expect(stateCookie?.value).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
    // The CSRF cookie must be HttpOnly + Lax so it survives the GitHub round-trip.
    expect(stateCookie?.httpOnly).toBe(true);
    expect(stateCookie?.sameSite).toBe('lax');
  });
});

describe('GET /callback', () => {
  it('503s when not configured', async () => {
    configured.mockReturnValue(false);
    const res = await callbackGet(req('/api/v1/users/me/github/callback?code=c&state=s'));
    expect(res.status).toBe(503);
  });

  it('redirects github=cancelled when the user declined, without persisting', async () => {
    const res = await callbackGet(req('/api/v1/users/me/github/callback?error=access_denied'));
    expect(res.headers.get('location')).toContain('github=cancelled');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a state mismatch — never reaches the token exchange or upsert', async () => {
    cookieJar.value = 'expected-state';
    const res = await callbackGet(
      req('/api/v1/users/me/github/callback?code=c&state=ATTACKER-STATE')
    );
    expect(res.headers.get('location')).toContain('github=error');
    expect(exchange).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects when the state cookie is absent (nothing to match against)', async () => {
    cookieJar.value = undefined;
    const res = await callbackGet(req('/api/v1/users/me/github/callback?code=c&state=s'));
    expect(res.headers.get('location')).toContain('github=error');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('exchanges the code, persists the identity, and redirects github=connected', async () => {
    cookieJar.value = 's1';
    exchange.mockResolvedValue('gho_token');
    fetchUser.mockResolvedValue({
      githubUserId: '583231',
      githubLogin: 'octocat',
      avatarUrl: 'https://a/o.png',
    });
    const res = await callbackGet(req('/api/v1/users/me/github/callback?code=abc&state=s1'));

    expect(exchange).toHaveBeenCalledWith('abc');
    expect(fetchUser).toHaveBeenCalledWith('gho_token');
    // Persisted against the session user, with the resolved identity.
    expect(upsert).toHaveBeenCalledWith('u1', {
      githubUserId: '583231',
      githubLogin: 'octocat',
      avatarUrl: 'https://a/o.png',
    });
    expect(res.headers.get('location')).toContain('github=connected');
  });

  it('redirects github=already-linked when the account belongs to another user', async () => {
    cookieJar.value = 's1';
    exchange.mockResolvedValue('gho_token');
    fetchUser.mockResolvedValue({ githubUserId: '1', githubLogin: 'x', avatarUrl: null });
    upsert.mockRejectedValue(new ConflictError('already linked'));
    const res = await callbackGet(req('/api/v1/users/me/github/callback?code=abc&state=s1'));
    expect(res.headers.get('location')).toContain('github=already-linked');
  });

  it('redirects github=error on an unexpected failure', async () => {
    cookieJar.value = 's1';
    exchange.mockRejectedValue(new Error('github down'));
    const res = await callbackGet(req('/api/v1/users/me/github/callback?code=abc&state=s1'));
    expect(res.headers.get('location')).toContain('github=error');
  });
});

describe('GET / (link state)', () => {
  it('reports a linked identity + the configured flag', async () => {
    getIdentity.mockResolvedValue({
      githubLogin: 'octocat',
      avatarUrl: 'https://a/o.png',
      connectedAt: new Date('2026-08-13T00:00:00.000Z'),
    });
    const res = await linkGet(req('/api/v1/users/me/github'));
    const body = await res.json();
    expect(body.data).toMatchObject({
      connected: true,
      githubLogin: 'octocat',
      configured: true,
    });
  });

  it('reports not-connected when there is no link', async () => {
    getIdentity.mockResolvedValue(null);
    const res = await linkGet(req('/api/v1/users/me/github'));
    const body = await res.json();
    expect(body.data.connected).toBe(false);
    expect(body.data.githubLogin).toBeNull();
  });
});

describe('DELETE / (unlink)', () => {
  it('disconnects the caller and reports not-connected', async () => {
    const res = await linkDelete(req('/api/v1/users/me/github'));
    const body = await res.json();
    expect(disconnect).toHaveBeenCalledWith('u1');
    expect(body.data.connected).toBe(false);
  });
});
