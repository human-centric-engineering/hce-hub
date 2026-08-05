import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyGithubSignature } from '@/lib/projects/github/verify-signature';

const SECRET = 'top-secret-webhook-key';

/** Produce the header GitHub would send for `body` under `secret`. */
function sign(body: string, secret: string = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

describe('verifyGithubSignature', () => {
  const body = JSON.stringify({ action: 'closed', pull_request: { merged: true } });

  it('accepts a correct signature', () => {
    expect(verifyGithubSignature(body, SECRET, sign(body))).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyGithubSignature(body, SECRET, sign(body, 'different-secret'))).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    const header = sign(body);
    const tampered = body.replace('true', 'false');
    expect(verifyGithubSignature(tampered, SECRET, header)).toBe(false);
  });

  it('rejects a header missing the sha256= prefix', () => {
    const bare = sign(body).slice('sha256='.length);
    expect(verifyGithubSignature(body, SECRET, bare)).toBe(false);
  });

  it('rejects a null / undefined / empty header', () => {
    expect(verifyGithubSignature(body, SECRET, null)).toBe(false);
    expect(verifyGithubSignature(body, SECRET, undefined)).toBe(false);
    expect(verifyGithubSignature(body, SECRET, '')).toBe(false);
  });

  it('rejects a well-formed prefix with a malformed / wrong-length digest', () => {
    expect(verifyGithubSignature(body, SECRET, 'sha256=deadbeef')).toBe(false);
    expect(verifyGithubSignature(body, SECRET, 'sha256=notevenhex')).toBe(false);
  });

  it('rejects a correctly-shaped but non-matching digest of the right length', () => {
    const wrong = `sha256=${'a'.repeat(64)}`;
    expect(verifyGithubSignature(body, SECRET, wrong)).toBe(false);
  });

  it('verifies a body containing multibyte UTF-8', () => {
    const utf8Body = JSON.stringify({ title: 'PR — fix café ✅' });
    expect(verifyGithubSignature(utf8Body, SECRET, sign(utf8Body))).toBe(true);
  });
});
