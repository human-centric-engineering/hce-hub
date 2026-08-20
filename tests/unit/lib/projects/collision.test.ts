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

describe('pathsOverlap — trailing wildcards (§33-sweep t-114)', () => {
  /**
   * Every row of the table in t-114's description, asserted BOTH ways round.
   * Order-independence is the point: `filesOverlap` compares the claiming scope
   * against the open claim's, so which side a glob lands on is an accident of
   * who claimed first — a matcher that only worked one way would warn or stay
   * silent depending on claim order.
   */
  const overlapping: [string, string][] = [
    // The case the warning exists for, and the one that never fired: a glob
    // scope against a real file beneath it.
    ['components/hub/projects/board/**', 'components/hub/projects/board/board-view.tsx'],
    // A broad glob against a narrower one under it — different depths.
    ['components/hub/projects/**', 'components/hub/projects/board/**'],
    // The entry that produced the false warnings that surfaced the defect.
    ['tests/**', 'tests/unit/components/hub/projects/ideas/idea-row.test.tsx'],
    // Already worked before t-114; pinned so the fix cannot regress them.
    ['components/hub/projects/board/**', 'components/hub/projects/board'],
    ['components/hub/projects/board', 'components/hub/projects/board/board-view.tsx'],
  ];

  it.each(overlapping)('%s overlaps %s', (a, b) => {
    expect(pathsOverlap(a, b)).toBe(true);
    expect(pathsOverlap(b, a)).toBe(true);
  });

  it('treats a single-star scope the same as a double-star one', () => {
    // `dir/*` is "the files in dir" and `dir/**` is "everything under dir".
    // The heuristic does not distinguish depth, and pretending to would be a
    // precision this module does not have.
    expect(pathsOverlap('lib/projects/*', 'lib/projects/collision.ts')).toBe(true);
    expect(pathsOverlap('lib/projects/*', 'lib/projects/capabilities/start-task.ts')).toBe(true);
  });

  it('normalises a wildcard written with a trailing slash, or doubled', () => {
    expect(pathsOverlap('lib/projects/**/', 'lib/projects/plan.ts')).toBe(true);
    expect(pathsOverlap('lib/projects/**/**', 'lib/projects/plan.ts')).toBe(true);
  });

  it('still refuses a SIBLING directory — the fix must not make everything collide', () => {
    // The whole risk of loosening a matcher: warnings that fire on everything
    // are the same as warnings that fire on nothing.
    expect(
      pathsOverlap('components/hub/projects/board/**', 'components/hub/projects/plan/**')
    ).toBe(false);
    expect(pathsOverlap('lib/user/**', 'lib/users/**')).toBe(false);
    expect(pathsOverlap('tests/**', 'lib/projects/collision.ts')).toBe(false);
  });

  it('leaves a PARTIAL pattern alone rather than guessing at it', () => {
    // `*.ts` is not a segment this module expands. Matching only itself is
    // silence — the cheap failure — where a guess could quietly mean "all of
    // lib". Documented behaviour, pinned so a future "improvement" is deliberate.
    expect(pathsOverlap('lib/projects/*.ts', 'lib/projects/collision.ts')).toBe(false);
    expect(pathsOverlap('lib/projects/*.ts', 'lib/projects/*.ts')).toBe(true);
  });

  it('does not collapse a bare wildcard to the empty path', () => {
    // Stripping `**` to '' would make it compare equal to a no-path entry and,
    // via the `na.length > 0` guard, silently match nothing at all. It has no
    // leading slash, so it is left intact and matches only itself.
    expect(pathsOverlap('**', '**')).toBe(true);
    expect(pathsOverlap('**', 'lib/projects/collision.ts')).toBe(false);
  });

  it('treats Next.js dynamic segments and route groups as literal directories', () => {
    // `[id]` and `(hub)` are real directory names on disk and the most common
    // shape in the Hub's own scopes — a matcher that read them as patterns
    // would mis-handle the majority case.
    expect(pathsOverlap('app/(hub)/projects/[id]/**', 'app/(hub)/projects/[id]/page.tsx')).toBe(
      true
    );
    expect(
      pathsOverlap(
        'app/(hub)/projects/[id]/page.tsx',
        'app/(hub)/projects/[id]/features/[slug]/page.tsx'
      )
    ).toBe(false);
  });
});

describe('filesOverlap — real scopes from the backlog (§33-sweep t-114)', () => {
  it('warns a migration-writing task against one naming a migration file', () => {
    // t-104 declares `prisma/migrations/**`; any task naming a specific
    // migration is exactly the conflict worth knowing about before you start.
    expect(
      filesOverlap(
        ['prisma/schema/app.prisma', 'prisma/migrations/**'],
        ['prisma/migrations/20260819143059_app_add_task_merged_at/migration.sql']
      )
    ).toBe(true);
  });

  it('stays quiet between two genuinely separate scopes', () => {
    expect(
      filesOverlap(
        ['components/hub/projects/task-sheet/**', 'lib/projects/task-detail.ts'],
        ['components/hub/projects/plan/phase-band.tsx', 'lib/projects/phases-service.ts']
      )
    ).toBe(false);
  });
});
