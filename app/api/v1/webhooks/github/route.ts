/**
 * GitHub PR webhook → Hub board reconciliation (f-github-sync §14).
 *
 * POST /api/v1/webhooks/github
 *
 * Standalone from the inbound-trigger pipeline (`/api/v1/inbound/*`), which is
 * workflow/agent-bound; this route reuses only the HMAC idea, with GitHub's own
 * `X-Hub-Signature-256` scheme. On a **merged** `pull_request` it drives every
 * task linked to that PR (`Task.prUrl`) to `merged`, credited to each task's
 * `claimedByUserId`.
 *
 * The section rate-limit (`/api/v1/webhooks/` → api tier) is applied upstream by
 * `proxy.ts`; there is no expensive sub-flow here (a lookup + a few updates), so
 * no per-flow limiter is needed in the handler.
 *
 * Responses are terse and non-enumerating:
 *   - 503 when unconfigured (no `GITHUB_WEBHOOK_SECRET`) — feature dormant
 *   - 401 on a bad/absent signature
 *   - 400 on an unreadable / non-JSON body
 *   - 200 otherwise, including no-op events (ping, non-merge) — so GitHub marks
 *     the delivery healthy and doesn't retry
 */

import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logging';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { verifyGithubSignature } from '@/lib/projects/github/verify-signature';
import { reconcilePullRequestEvent } from '@/lib/projects/github/reconcile';

export async function POST(request: NextRequest): Promise<Response> {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Feature not activated on this deployment. 503 (retryable) rather than 404
    // so a mis-timed delivery during rollout is retried once the secret lands.
    return errorResponse('GitHub sync is not configured on this deployment.', {
      code: 'NOT_CONFIGURED',
      status: 503,
    });
  }

  // GitHub signs the RAW body, so read it as text and verify BEFORE parsing.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    logger.warn('github-sync: failed to read request body', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('Bad request', { code: 'VALIDATION_ERROR', status: 400 });
  }

  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyGithubSignature(rawBody, secret, signature)) {
    return errorResponse('Invalid signature', { code: 'UNAUTHORIZED', status: 401 });
  }

  // Only pull_request events can carry a merge to reconcile. `ping` (sent on
  // webhook creation) and every other event type → healthy 200 no-op.
  const event = request.headers.get('x-github-event');
  if (event !== 'pull_request') {
    return successResponse({ handled: false, event });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse('Request body is not valid JSON', {
      code: 'VALIDATION_ERROR',
      status: 400,
    });
  }

  // Payload shape is validated (Zod) inside the reconciler, which never throws
  // on shape or a per-task resolution failure — it returns a summary to log.
  const result = await reconcilePullRequestEvent(payload);
  return successResponse(result);
}
