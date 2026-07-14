/**
 * Tests for `lib/projects/collision.ts` — soft file-overlap detection.
 *
 * Overlap is a forgiving heuristic (same path or directory-prefix containment).
 * It's a signal, not a lock, so the edges that matter are: don't false-match on
 * a shared name fragment (auth vs authz), do match a directory prefix, and never
 * warn when the claiming task declares no file scope.
 */

import { describe, it, expect } from 'vitest';
import {
  pathsOverlap,
  filesOverlap,
  detectFileOverlapWarnings,
  type OpenClaim,
} from '@/lib/projects/collision';

describe('pathsOverlap', () => {
  it('matches identical paths (trailing slash normalized)', () => {
    expect(pathsOverlap('api/auth.ts', 'api/auth.ts')).toBe(true);
    expect(pathsOverlap('api/', 'api')).toBe(true);
  });

  it('matches directory-prefix containment either way', () => {
    expect(pathsOverlap('api', 'api/auth.ts')).toBe(true);
    expect(pathsOverlap('api/auth.ts', 'api/')).toBe(true);
  });

  it('does not false-match on a shared name fragment', () => {
    expect(pathsOverlap('api/auth', 'api/authz')).toBe(false);
    expect(pathsOverlap('lib/user', 'lib/users')).toBe(false);
  });

  it('does not match disjoint paths or empty entries', () => {
    expect(pathsOverlap('api/auth.ts', 'web/home.tsx')).toBe(false);
    expect(pathsOverlap('', '')).toBe(false);
  });
});

describe('filesOverlap', () => {
  it('is true when any pair of entries overlaps', () => {
    expect(filesOverlap(['web/', 'api/auth.ts'], ['db/x', 'api/'])).toBe(true);
  });
  it('is false when nothing overlaps', () => {
    expect(filesOverlap(['web/home.tsx'], ['api/auth.ts'])).toBe(false);
  });
  it('is false against an empty set', () => {
    expect(filesOverlap([], ['api/'])).toBe(false);
  });
});

describe('detectFileOverlapWarnings', () => {
  const claim = (id: string, files: string[], userId = 'u2'): OpenClaim => ({
    userId,
    claimedAt: new Date('2026-07-14T00:00:00Z'),
    taskId: id,
    taskTitle: `task ${id}`,
    filesScope: files,
  });

  it('returns no warnings when the claiming task has no file scope', () => {
    expect(detectFileOverlapWarnings([], [claim('t2', ['api/'])])).toEqual([]);
  });

  it('warns for each open claim whose files overlap, and skips those that do not', () => {
    const warnings = detectFileOverlapWarnings(
      ['api/auth.ts'],
      [claim('t2', ['api/']), claim('t3', ['web/home.tsx']), claim('t4', ['api/auth.ts'])]
    );
    expect(warnings.map((w) => w.taskId)).toEqual(['t2', 't4']);
    expect(warnings.every((w) => w.kind === 'file_overlap')).toBe(true);
    expect(warnings[0]).toMatchObject({ userId: 'u2', taskId: 't2' });
  });
});
