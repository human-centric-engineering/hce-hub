/**
 * Unit: `computeFeatureProgress` — feature completion, sealed at the ship
 * boundary (f-bug-handling §22-02; ship boundary from f-work-kinds §32 t-79).
 *
 * Two load-bearing properties. A `bug` never counts toward completion, so an open
 * bug on a shipped feature can't make it read "3/4 merged" — it surfaces as
 * `openFixes` instead. And past `shippedAt`, **no** task counts toward completion
 * whatever its kind, which is what lets an improvement be filed honestly as an
 * `enhancement` rather than disguised as a bug to protect the progress bar.
 */
import { describe, it, expect } from 'vitest';
import type { TaskKind } from '@prisma/client';
import { computeFeatureProgress } from '@/lib/projects/feature-progress';
import type { EffectiveStatus } from '@/lib/projects/task-status';

const SHIPPED = new Date('2026-08-01T12:00:00Z');
const BEFORE = new Date('2026-07-20T09:00:00Z');
const AFTER = new Date('2026-08-09T09:00:00Z');

const t = (status: EffectiveStatus, kind: TaskKind = 'feature_work', createdAt: Date = BEFORE) => ({
  status,
  kind,
  createdAt,
});

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

  describe('the ship boundary', () => {
    it('keeps a post-ship enhancement off the completion axis entirely', () => {
      // THE motivating case: an improvement raised on a feature that already
      // shipped. Filed honestly as `enhancement`, it must not drag 2/2 down to
      // 2/3 — which is exactly the dent that used to force it to be filed as a bug.
      const p = computeFeatureProgress(
        [
          t('merged', 'feature_work', BEFORE),
          t('merged', 'feature_work', BEFORE),
          t('claimed', 'enhancement', AFTER),
        ],
        SHIPPED
      );
      expect(p.total).toBe(2);
      expect(p.merged).toBe(2); // still reads 2/2 — visibly complete
      expect(p.blocked).toBe(0);
      expect(p.openFixes).toBe(0); // an enhancement is not a fix
    });

    it('excludes post-ship feature_work from COMPLETION too — the boundary is kind-blind', () => {
      // The property that makes future kinds safe: it is the DATE that decides
      // completion, not the enum. Even plain feature_work raised after ship is off
      // the completion axis — while still reporting as live, because it is.
      const p = computeFeatureProgress(
        [t('merged', 'feature_work', BEFORE), t('active', 'feature_work', AFTER)],
        SHIPPED
      );
      expect(p).toEqual({ total: 1, merged: 1, live: 1, blocked: 0, openFixes: 0 });
    });

    it('still counts a post-ship bug as an open fix', () => {
      // openFixes deliberately spans the whole set: a defect found after ship is
      // the most important kind to surface, so the boundary must not hide it.
      const p = computeFeatureProgress(
        [t('merged', 'feature_work', BEFORE), t('claimed', 'bug', AFTER)],
        SHIPPED
      );
      expect(p.total).toBe(1);
      expect(p.merged).toBe(1);
      expect(p.openFixes).toBe(1);
    });

    it('counts a task created exactly at the ship instant as build-out', () => {
      // Boundary is inclusive: ship_feature stamps shippedAt in the same
      // transaction that flips the status, so a task created in that instant was
      // part of the build, not a follow-up.
      const p = computeFeatureProgress([t('merged', 'feature_work', SHIPPED)], SHIPPED);
      expect(p.total).toBe(1);
      expect(p.merged).toBe(1);
    });

    it('counts every task when shippedAt is null — the safe degradation', () => {
      // Unshipped features, and any feature the backfill could not resolve, keep
      // today's behaviour exactly. The failure mode is "counts too much", never
      // "reads complete when it is not".
      const p = computeFeatureProgress(
        [t('merged', 'feature_work', BEFORE), t('claimed', 'enhancement', AFTER)],
        null
      );
      expect(p.total).toBe(2);
      expect(p.merged).toBe(1);
    });

    it('still reports post-ship work as live — the boundary seals completion, not activity', () => {
      // The row must not read "2/2" with no live marker while its own task table
      // shows that task as active (the §09 summary-agrees-with-its-table
      // invariant). Completion is history; activity is news.
      const p = computeFeatureProgress(
        [
          t('merged', 'feature_work', BEFORE),
          t('merged', 'feature_work', BEFORE),
          t('active', 'enhancement', AFTER),
        ],
        SHIPPED
      );
      expect(p.total).toBe(2); // sealed
      expect(p.merged).toBe(2); // sealed
      expect(p.live).toBe(1); // NOT sealed — someone is working it right now
    });

    it('still reports a post-ship dependency-blocked task as blocked', () => {
      const p = computeFeatureProgress(
        [t('merged', 'feature_work', BEFORE), t('blocked', 'enhancement', AFTER)],
        SHIPPED
      );
      expect(p.total).toBe(1);
      expect(p.blocked).toBe(1);
    });

    it('counts a pre-ship enhancement as build-out', () => {
      // An enhancement planned as part of the build IS scope, so it counts — which
      // is why ship_feature's unmerged-tasks warning must not exclude the kind.
      const p = computeFeatureProgress(
        [t('merged', 'feature_work', BEFORE), t('claimed', 'enhancement', BEFORE)],
        SHIPPED
      );
      expect(p.total).toBe(2);
      expect(p.merged).toBe(1); // reads 1/2 — honestly incomplete
    });
  });
});
