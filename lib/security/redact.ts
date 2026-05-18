/**
 * PII Redaction Utilities
 *
 * Stateless masking primitives for stripping PII before persistence.
 * Distinct from `lib/security/sanitize.ts` — sanitization is for
 * preventing XSS / injection in *output* (escape, strip, validate);
 * redaction is for hiding personal data in *audit records* before it
 * lands in the DB.
 *
 * The primary consumer is `BaseCapability.redactProvenance()` — each
 * PII-handling capability uses these helpers to construct what gets
 * persisted in `AiMessage.provenance.capabilityCalls[]`. The LLM still
 * sees the un-redacted values; only the durable audit row does not.
 *
 * Design rules of the road:
 * - Every function is pure (no I/O, no global state).
 * - Null / undefined / non-string inputs return safe defaults, not throws.
 * - Masks preserve enough signal for an auditor to recognise the *shape*
 *   of the original (an email looks like an email, a phone like a phone)
 *   without revealing the value.
 * - Hash-based masking is intentionally NOT here — a hash of "bob@x.com"
 *   is still linkable across rows, which is half the point of redacting.
 *   Use `redactedString()` when even shape leakage is unwanted.
 *
 * @example
 * ```typescript
 * import { maskEmail, maskKeysInObject, redactedString } from '@/lib/security/redact';
 *
 * maskEmail('alice.smith@example.com');     // → "a***@e***.com"
 * maskKeysInObject(headers, ['Authorization']); // → { Authorization: '<redacted>' }
 * redactedString('body');                    // → "<redacted: body>"
 * ```
 */

/**
 * Mask an email address while keeping the shape recognisable.
 *
 * Format: first char of local part + `***` + `@` + first char of domain
 * + `***` + TLD. The TLD is preserved because it's commonly useful for
 * audit context (".gov" vs ".com" tells you something) but doesn't leak
 * PII.
 *
 * Non-string or malformed inputs return `<redacted: email>`.
 *
 * @example
 * maskEmail('alice.smith@example.com')  // → "a***@e***.com"
 * maskEmail('a@b.io')                   // → "a***@b***.io"
 * maskEmail('not an email')             // → "<redacted: email>"
 * maskEmail(null as unknown as string)  // → "<redacted: email>"
 */
export function maskEmail(value: unknown): string {
  if (typeof value !== 'string') return redactedString('email');
  const at = value.indexOf('@');
  if (at <= 0 || at === value.length - 1) return redactedString('email');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || dot === domain.length - 1) return redactedString('email');
  const tld = domain.slice(dot); // includes the leading "."
  return `${local[0]}***@${domain[0]}***${tld}`;
}

/**
 * Mask a phone number while keeping the last 4 digits as a check value.
 *
 * Strips non-digit characters first, then keeps the last 4 digits and
 * replaces the rest with `***-***-`. Auditors can confirm "this is the
 * number ending in 1234" without seeing the full value.
 *
 * If the input doesn't contain at least 4 digits, returns
 * `<redacted: phone>` — a too-short value gives no signal and is more
 * useful redacted entirely.
 *
 * @example
 * maskPhone('+44 7700 901234')   // → "***-***-1234"
 * maskPhone('(555) 123-4567')    // → "***-***-4567"
 * maskPhone('not a phone')       // → "<redacted: phone>"
 */
export function maskPhone(value: unknown): string {
  if (typeof value !== 'string') return redactedString('phone');
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return redactedString('phone');
  return `***-***-${digits.slice(-4)}`;
}

/**
 * Mask a bearer-token-style auth header value.
 *
 * Preserves the scheme prefix (`Bearer `, `Basic `, etc.) so an auditor
 * can see *how* the request was authenticated without seeing the token.
 * The token body is replaced with `****`.
 *
 * For plain token strings (no scheme prefix) the entire value is
 * replaced with `<redacted: token>`.
 *
 * @example
 * maskBearerToken('Bearer eyJhbGc...long.jwt')  // → "Bearer ****"
 * maskBearerToken('Basic dXNlcjpwYXNz')          // → "Basic ****"
 * maskBearerToken('sk-proj-abc123')              // → "<redacted: token>"
 */
export function maskBearerToken(value: unknown): string {
  if (typeof value !== 'string') return redactedString('token');
  const match = value.match(/^(Bearer|Basic|Digest|Token|API-Key)\s+/i);
  if (match) return `${match[1]} ****`;
  return redactedString('token');
}

/**
 * Replace specific keys anywhere in a nested object / array structure.
 *
 * Walks the value recursively and replaces every property whose name
 * matches one of `keys` (case-insensitive). Useful for redacting
 * `Authorization` / `X-Api-Key` headers regardless of whether the
 * sender capitalised them, or stripping `email` fields across a deeply
 * nested customer record.
 *
 * The replacement can be:
 * - A string (each matched value is replaced with that string)
 * - A function `(originalValue) => unknown` that receives the original
 *   and returns the redacted form (e.g. pass `maskEmail` to keep shape)
 *
 * Arrays are walked element by element. Primitives are returned as-is.
 * Null and undefined inputs return the input unchanged.
 *
 * NOTE: This returns a *new* structure — the input is not mutated. The
 * generic `<T>` preserves the input's TypeScript shape for caller
 * convenience, but callers should treat the result as `unknown` for
 * safety since redaction changes runtime types.
 *
 * @example
 * maskKeysInObject(
 *   { headers: { Authorization: 'Bearer x', 'X-Api-Key': 'k' }, body: '...' },
 *   ['Authorization', 'X-Api-Key']
 * );
 * // → { headers: { Authorization: '<redacted>', 'X-Api-Key': '<redacted>' }, body: '...' }
 *
 * maskKeysInObject(
 *   { recipients: [{ email: 'a@b.com' }, { email: 'c@d.com' }] },
 *   ['email'],
 *   maskEmail
 * );
 * // → { recipients: [{ email: 'a***@b***.com' }, { email: 'c***@d***.com' }] }
 */
export function maskKeysInObject<T>(
  obj: T,
  keys: ReadonlyArray<string>,
  replacement: string | ((value: unknown) => unknown) = redactedString()
): T {
  if (obj === null || obj === undefined) return obj;
  const keySet = new Set(keys.map((k) => k.toLowerCase()));
  return walk(obj, keySet, replacement) as T;
}

function walk(
  value: unknown,
  keySet: ReadonlySet<string>,
  replacement: string | ((value: unknown) => unknown)
): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, keySet, replacement));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keySet.has(k.toLowerCase())) {
        out[k] = typeof replacement === 'function' ? replacement(v) : replacement;
      } else {
        out[k] = walk(v, keySet, replacement);
      }
    }
    return out;
  }
  return value;
}

/**
 * The canonical "this value was removed" sentinel for audit records.
 *
 * Use this when even the *shape* of the original value shouldn't leak
 * (free-text user input, request bodies, workflow outputs). The
 * optional `reason` is rendered for the auditor: `<redacted: body>`
 * tells the reader what was here without revealing it.
 *
 * @example
 * redactedString()         // → "<redacted>"
 * redactedString('body')   // → "<redacted: body>"
 */
export function redactedString(reason?: string): string {
  return reason ? `<redacted: ${reason}>` : '<redacted>';
}
