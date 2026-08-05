import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mutable env so each test can toggle the secret's presence.
const { mockEnv, verifyGithubSignature, reconcilePullRequestEvent } = vi.hoisted(() => {
  const mockEnv: { GITHUB_WEBHOOK_SECRET: string | undefined } = {
    GITHUB_WEBHOOK_SECRET: 'test-secret',
  };
  return { mockEnv, verifyGithubSignature: vi.fn(), reconcilePullRequestEvent: vi.fn() };
});
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/projects/github/verify-signature', () => ({ verifyGithubSignature }));
vi.mock('@/lib/projects/github/reconcile', () => ({ reconcilePullRequestEvent }));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/v1/webhooks/github/route';

function makeRequest(opts: { body?: string; event?: string; signature?: string }): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.event) headers['x-github-event'] = opts.event;
  if (opts.signature) headers['x-hub-signature-256'] = opts.signature;
  return new NextRequest('http://localhost:3000/api/v1/webhooks/github', {
    method: 'POST',
    headers,
    body: opts.body ?? '',
  });
}

const mergedBody = JSON.stringify({
  action: 'closed',
  pull_request: { html_url: 'https://github.com/o/r/pull/1', merged: true },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.GITHUB_WEBHOOK_SECRET = 'test-secret';
  verifyGithubSignature.mockReturnValue(true);
  reconcilePullRequestEvent.mockResolvedValue({
    handled: true,
    prUrl: 'https://github.com/o/r/pull/1',
    matched: 1,
    reconciled: 1,
    skipped: 0,
  });
});

describe('POST /api/v1/webhooks/github', () => {
  it('returns 503 when the webhook secret is not configured', async () => {
    mockEnv.GITHUB_WEBHOOK_SECRET = undefined;
    const res = await POST(
      makeRequest({ body: mergedBody, event: 'pull_request', signature: 'x' })
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.code).toBe('NOT_CONFIGURED');
    expect(verifyGithubSignature).not.toHaveBeenCalled();
  });

  it('returns 401 on an invalid signature and does not reconcile', async () => {
    verifyGithubSignature.mockReturnValue(false);
    const res = await POST(
      makeRequest({ body: mergedBody, event: 'pull_request', signature: 'sha256=bad' })
    );
    expect(res.status).toBe(401);
    expect(reconcilePullRequestEvent).not.toHaveBeenCalled();
  });

  it('verifies against the RAW body it received', async () => {
    await POST(makeRequest({ body: mergedBody, event: 'pull_request', signature: 'sha256=ok' }));
    expect(verifyGithubSignature).toHaveBeenCalledWith(mergedBody, 'test-secret', 'sha256=ok');
  });

  it('200 no-ops a ping event without reconciling', async () => {
    const res = await POST(makeRequest({ body: '{"zen":"..."}', event: 'ping', signature: 'ok' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ handled: false, event: 'ping' });
    expect(reconcilePullRequestEvent).not.toHaveBeenCalled();
  });

  it('reconciles a valid pull_request event and returns its summary', async () => {
    const res = await POST(
      makeRequest({ body: mergedBody, event: 'pull_request', signature: 'ok' })
    );
    expect(res.status).toBe(200);
    expect(reconcilePullRequestEvent).toHaveBeenCalledWith(JSON.parse(mergedBody));
    const json = await res.json();
    expect(json.data).toMatchObject({ handled: true, reconciled: 1 });
  });

  it('returns 400 when a signed pull_request body is not valid JSON', async () => {
    const res = await POST(
      makeRequest({ body: 'not json', event: 'pull_request', signature: 'ok' })
    );
    expect(res.status).toBe(400);
    expect(reconcilePullRequestEvent).not.toHaveBeenCalled();
  });

  it('returns 400 when the request body cannot be read', async () => {
    const req = makeRequest({ body: mergedBody, event: 'pull_request', signature: 'ok' });
    vi.spyOn(req, 'text').mockRejectedValue(new Error('stream error'));
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(verifyGithubSignature).not.toHaveBeenCalled();
  });
});
