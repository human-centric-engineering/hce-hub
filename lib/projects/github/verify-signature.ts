/**
 * GitHub webhook signature verification (f-github-sync §14 t-41).
 *
 * GitHub signs each webhook delivery as `HMAC-SHA256(secret, rawBody)` and sends
 * the digest in the `X-Hub-Signature-256: sha256=<hex>` header. This is a
 * DIFFERENT scheme from Sunrise's `verifyHookSignature`
 * (`lib/orchestration/hooks/signing.ts`), which signs `${timestamp}.${body}`
 * with an `X-Sunrise-Timestamp`/`X-Sunrise-Signature` pair — GitHub has no
 * timestamp component, so that verifier is not reusable and this fork-owned one
 * exists instead.
 *
 * Constant-time comparison via `timingSafeEqual`. A malformed, wrong-length, or
 * absent header is simply `false` — never a throw — so the route can answer a
 * uniform 401 without leaking which part failed.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify a GitHub webhook's `X-Hub-Signature-256` header against the raw request
 * body. Returns `true` only for a well-formed header whose digest matches an
 * HMAC-SHA256 of `rawBody` under `secret`.
 *
 * @param rawBody - the exact request body bytes as read via `request.text()`
 *   (GitHub signs the raw body; a re-serialised/parsed body would not match)
 * @param secret - the shared webhook secret (`GITHUB_WEBHOOK_SECRET`)
 * @param signatureHeader - the `X-Hub-Signature-256` header value, or null
 */
export function verifyGithubSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null | undefined
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const providedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expectedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  // Compare as raw bytes. `Buffer.from(hex, 'hex')` drops trailing invalid
  // nibbles, so a length mismatch (our first guard) also catches malformed hex;
  // timingSafeEqual requires equal-length buffers.
  const provided = Buffer.from(providedHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}
