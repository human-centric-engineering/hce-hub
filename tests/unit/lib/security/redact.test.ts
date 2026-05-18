/**
 * Tests for `lib/security/redact.ts`.
 *
 * Masking is the kind of code where a half-baked regex is worse than no
 * regex at all — a mask that misses some inputs gives false confidence
 * that data is being protected. Each primitive is tested across the
 * happy path, edge cases, and pathological inputs.
 */

import { describe, expect, it } from 'vitest';

import {
  maskBearerToken,
  maskEmail,
  maskKeysInObject,
  maskPhone,
  redactedString,
} from '@/lib/security/redact';

describe('redactedString', () => {
  it('returns the canonical placeholder by default', () => {
    expect(redactedString()).toBe('<redacted>');
  });

  it('appends the reason when one is provided', () => {
    expect(redactedString('body')).toBe('<redacted: body>');
    expect(redactedString('credit_card')).toBe('<redacted: credit_card>');
  });
});

describe('maskEmail', () => {
  it.each([
    ['alice.smith@example.com', 'a***@e***.com'],
    ['a@b.io', 'a***@b***.io'],
    ['bob@host.co.uk', 'b***@h***.uk'], // multi-segment TLD — last segment wins
    ['UPPER@CASE.COM', 'U***@C***.COM'], // case preserved (don't re-case real values)
  ])('masks %s → %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it.each([
    'not an email',
    '@nolocal.com',
    'noatsymbol',
    'trailingat@',
    'no-dot-in-domain@example',
    '',
  ])('redacts malformed inputs (%j)', (input) => {
    expect(maskEmail(input)).toBe('<redacted: email>');
  });

  it('redacts when given a non-string input', () => {
    expect(maskEmail(null)).toBe('<redacted: email>');
    expect(maskEmail(undefined)).toBe('<redacted: email>');
    expect(maskEmail(123)).toBe('<redacted: email>');
  });
});

describe('maskPhone', () => {
  it.each([
    ['+44 7700 901234', '***-***-1234'],
    ['(555) 123-4567', '***-***-4567'],
    ['5551234', '***-***-1234'],
    ['+1-202-555-0173', '***-***-0173'],
    ['(0)20.7946.0958', '***-***-0958'],
  ])('keeps the last four digits of %s → %s', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });

  it.each(['abc', '12', 'no digits at all!', ''])(
    'redacts when fewer than 4 digits (%j)',
    (input) => {
      expect(maskPhone(input)).toBe('<redacted: phone>');
    }
  );

  it('redacts non-string inputs', () => {
    expect(maskPhone(null)).toBe('<redacted: phone>');
    expect(maskPhone(1234567)).toBe('<redacted: phone>');
  });
});

describe('maskBearerToken', () => {
  it.each([
    ['Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0', 'Bearer ****'],
    ['bearer abc123', 'bearer ****'], // case-insensitive scheme detection
    ['Basic dXNlcjpwYXNz', 'Basic ****'],
    ['Digest realm="x"', 'Digest ****'],
    ['Token sk-proj-abcdef', 'Token ****'],
    ['API-Key xyz', 'API-Key ****'],
  ])('preserves scheme on %s → %s', (input, expected) => {
    expect(maskBearerToken(input)).toBe(expected);
  });

  it('redacts plain tokens with no scheme prefix', () => {
    expect(maskBearerToken('sk-proj-abc123def')).toBe('<redacted: token>');
    expect(maskBearerToken('raw-jwt-without-bearer')).toBe('<redacted: token>');
  });

  it('redacts non-string inputs', () => {
    expect(maskBearerToken(null)).toBe('<redacted: token>');
    expect(maskBearerToken(undefined)).toBe('<redacted: token>');
  });
});

describe('maskKeysInObject', () => {
  it('replaces matching top-level keys with the default placeholder', () => {
    const result = maskKeysInObject({ name: 'Alice', password: 'hunter2', email: 'a@b.com' }, [
      'password',
    ]);
    expect(result).toEqual({ name: 'Alice', password: '<redacted>', email: 'a@b.com' });
  });

  it('matches keys case-insensitively', () => {
    const result = maskKeysInObject({ Authorization: 'Bearer x', 'X-Api-Key': 'k', body: 'ok' }, [
      'authorization',
      'x-api-key',
    ]);
    expect(result).toEqual({ Authorization: '<redacted>', 'X-Api-Key': '<redacted>', body: 'ok' });
  });

  it('walks into nested objects', () => {
    const result = maskKeysInObject(
      { user: { profile: { email: 'a@b.com', phone: '555-1234' } }, locale: 'en' },
      ['email']
    );
    expect(result).toEqual({
      user: { profile: { email: '<redacted>', phone: '555-1234' } },
      locale: 'en',
    });
  });

  it('walks into arrays of objects', () => {
    const result = maskKeysInObject({ recipients: [{ email: 'a@b.com' }, { email: 'c@d.com' }] }, [
      'email',
    ]);
    expect(result).toEqual({
      recipients: [{ email: '<redacted>' }, { email: '<redacted>' }],
    });
  });

  it('accepts a function replacement that receives the original value', () => {
    const result = maskKeysInObject(
      { email: 'alice@example.com', other: 'unchanged' },
      ['email'],
      maskEmail
    );
    expect(result).toEqual({ email: 'a***@e***.com', other: 'unchanged' });
  });

  it('accepts a custom static replacement string', () => {
    const result = maskKeysInObject({ secret: 'shh' }, ['secret'], '<scrubbed>');
    expect(result).toEqual({ secret: '<scrubbed>' });
  });

  it('returns null / undefined inputs unchanged', () => {
    expect(maskKeysInObject(null, ['email'])).toBeNull();
    expect(maskKeysInObject(undefined, ['email'])).toBeUndefined();
  });

  it('returns primitive inputs unchanged', () => {
    expect(maskKeysInObject('a string', ['email'])).toBe('a string');
    expect(maskKeysInObject(42, ['email'])).toBe(42);
    expect(maskKeysInObject(true, ['email'])).toBe(true);
  });

  it('does not mutate the input object', () => {
    const input = { email: 'a@b.com', user: { email: 'c@d.com' } };
    const before = JSON.stringify(input);
    maskKeysInObject(input, ['email']);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('handles deeply mixed structures (object → array → object)', () => {
    const result = maskKeysInObject(
      {
        request: {
          headers: { Authorization: 'Bearer x' },
          parts: [
            { name: 'file1', content: '...' },
            { name: 'file2', secretKey: 'k' },
          ],
        },
      },
      ['authorization', 'secretkey']
    );
    expect(result).toEqual({
      request: {
        headers: { Authorization: '<redacted>' },
        parts: [
          { name: 'file1', content: '...' },
          { name: 'file2', secretKey: '<redacted>' },
        ],
      },
    });
  });

  it('returns empty objects unchanged', () => {
    expect(maskKeysInObject({}, ['email'])).toEqual({});
    expect(maskKeysInObject([], ['email'])).toEqual([]);
  });
});
