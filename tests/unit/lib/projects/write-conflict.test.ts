/**
 * Tests for `lib/projects/write-conflict.ts` (f-authoring-fidelity §21 t-87).
 *
 * A one-predicate module, but the predicate decides whether a concurrent writer
 * gets a retryable answer or a 500, so both halves of the condition are pinned:
 * the error must be a Prisma known-request error AND carry `P2034`. A looser
 * check (`err.code === 'P2034'` on any object, or `instanceof` alone) would
 * mislabel unrelated failures as "someone else got there first" and tell the
 * caller to retry a request that will never succeed.
 */

import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { isWriteConflict } from '@/lib/projects/write-conflict';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

describe('isWriteConflict', () => {
  it('recognises Prisma P2034 — the SSI serialization failure / deadlock', () => {
    expect(isWriteConflict(prismaError('P2034'))).toBe(true);
  });

  it('rejects other Prisma known-request errors', () => {
    // P2002 (unique constraint) and P2025 (record not found) are the caller's
    // fault, not a race — retrying them loops forever.
    expect(isWriteConflict(prismaError('P2002'))).toBe(false);
    expect(isWriteConflict(prismaError('P2025'))).toBe(false);
  });

  it('rejects a plain error that merely carries the same code', () => {
    // Shape-matching alone would let any thrown object claim to be a write
    // conflict; the instanceof half of the check is what prevents that.
    expect(isWriteConflict(Object.assign(new Error('write conflict'), { code: 'P2034' }))).toBe(
      false
    );
  });

  it('rejects non-Prisma failures and non-errors', () => {
    expect(isWriteConflict(new Error('connection reset'))).toBe(false);
    expect(isWriteConflict('P2034')).toBe(false);
    expect(isWriteConflict(null)).toBe(false);
    expect(isWriteConflict(undefined)).toBe(false);
  });
});
