/**
 * Unit: parseCuidParam (fork-owned path-param validator).
 */
import { describe, it, expect } from 'vitest';
import { parseCuidParam } from '@/lib/api/route-params';
import { ValidationError } from '@/lib/api/errors';

const VALID_CUID = 'cmjbv4i3x00003wsloputgwul';

describe('parseCuidParam', () => {
  it('returns a valid CUID unchanged', () => {
    expect(parseCuidParam(VALID_CUID)).toBe(VALID_CUID);
  });

  it('throws ValidationError on a non-CUID', () => {
    expect(() => parseCuidParam('not-a-cuid')).toThrow(ValidationError);
    expect(() => parseCuidParam('')).toThrow(ValidationError);
  });

  it('names the field in the error detail (defaults to id)', () => {
    try {
      parseCuidParam('bad', 'projectId');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toMatch(/invalid projectId/i);
    }
  });
});
