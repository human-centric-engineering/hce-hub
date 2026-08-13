/**
 * f-github-sync §14 t-43 — end-to-end "smoke" through the real route with the
 * REAL signature verifier and REAL reconciler wired together. Only the leaves
 * are mocked: the env secret and the DB (`prisma.task.findMany`) / the
 * `completeTask` core. A genuine `X-Hub-Signature-256` is computed here exactly
 * as GitHub would, so this proves route → verify → reconcile compose correctly —
 * the parts the fully-mocked unit tests stub out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

const SECRET = 'integration-webhook-secret';

const { mockEnv, findMany, completeTask } = vi.hoisted(() => ({
  mockEnv: { GITHUB_WEBHOOK_SECRET: undefined as string | undefined },
  findMany: vi.fn(),
  completeTask: vi.fn(),
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/db/client', () => ({ prisma: { task: { findMany } } }));
vi.mock('@/lib/projects/task-actions', () => ({ completeTask }));
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/v1/webhooks/github/route';

const PR_URL = 'https://github.com/human-centric-engineering/hce-hub/pull/94';
const payload = JSON.stringify({
  action: 'closed',
  pull_request: { html_url: PR_URL, merged: true },
});

function signed(body: string, secret = SECRET, event = 'pull_request'): NextRequest {
  const signature = `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
  return new NextRequest('http://localhost:3000/api/v1/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-hub-signature-256': signature,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.GITHUB_WEBHOOK_SECRET = SECRET;
  completeTask.mockResolvedValue({ taskId: 't', status: 'merged', warnings: [] });
});

describe('POST /api/v1/webhooks/github — genuine signature path', () => {
  it('accepts a genuinely-signed merged PR and completes the linked task', async () => {
    findMany.mockResolvedValue([{ id: 't-40', claimedByUserId: 'user-A' }]);

    const res = await POST(signed(payload));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ handled: true, matched: 1, reconciled: 1, skipped: 0 });
    // 4-arg call (…, expectedProjectId=undefined, mergedBy=undefined — no merged_by here).
    expect(completeTask).toHaveBeenCalledExactlyOnceWith('user-A', 't-40', undefined, undefined);
  });

  it('rejects a payload signed with the wrong secret (real 401)', async () => {
    const res = await POST(signed(payload, 'the-wrong-secret'));
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(completeTask).not.toHaveBeenCalled();
  });

  it('rejects a tampered body whose signature no longer matches', async () => {
    // Sign the original, then swap the body — the digest no longer covers it.
    const req = signed(payload);
    const tamperedReq = new NextRequest(req.url, {
      method: 'POST',
      headers: req.headers,
      body: payload.replace('/pull/94', '/pull/999'),
    });
    const res = await POST(tamperedReq);
    expect(res.status).toBe(401);
    expect(completeTask).not.toHaveBeenCalled();
  });
});
