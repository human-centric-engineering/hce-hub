/**
 * Unit: `computeFeatureProgress` — kind-aware feature completion (f-bug-handling
 * §22-02). The load-bearing property: a `bug` task never counts toward a feature's
 * completion, so an open bug on a shipped feature can't make it read "3/4 merged";
 * open bugs surface separately as `openFixes`.
 */
import { describe, it, expect } from 'vitest';
import type { TaskKind } from '@prisma/client';
import { computeFeatureProgress } from '@/lib/projects/feature-progress';
import type { EffectiveStatus } from '@/lib/projects/task-status';

const t = (status: EffectiveStatus, kind: TaskKind = 'feature_work') => ({ status, kind });

describe('computeFeatureProgress', () => {
  it('counts feature-work across every completion metric', () => {
    const p = computeFeatureProgress([t('merged'), t('merged'), t('active'), t('blocked')]);
    expect(p).toEqual({ total: 4, merged: 2, live: 1, blocked: 1, openFixes: 0 });
  });

  it('excludes bugs from completion and tallies open bugs as openFixes', () => {
    // A shipped feature: all 3 feature-work merged, one open bug + one fixed bug.
    const p = computeFeatureProgress([
      t('merged'),
      t('merged'),
      t('merged'),
      t('active', 'bug'), // an open fix
      t('merged', 'bug'), // a fixed (merged) bug — not open
    ]);
    expect(p.total).toBe(3); // NOT 5 — bugs never count toward completion
    expect(p.merged).toBe(3); // reads 3/3, so the feature stays visibly shipped
    expect(p.live).toBe(0); // the worked bug is not "live" feature-work
    expect(p.openFixes).toBe(1); // only the unmerged bug
  });

  it('counts a claimed or blocked bug as an open fix', () => {
    const p = computeFeatureProgress([t('blocked', 'bug'), t('claimed', 'bug')]);
    expect(p.total).toBe(0);
    expect(p.openFixes).toBe(2);
  });

  it('is all-zero for a feature with no tasks', () => {
    expect(computeFeatureProgress([])).toEqual({
      total: 0,
      merged: 0,
      live: 0,
      blocked: 0,
      openFixes: 0,
    });
  });
});
