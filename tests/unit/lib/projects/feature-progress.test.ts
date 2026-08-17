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
import { TaskStatus, type TaskKind } from '@prisma/client';
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
    expect(p).toEqual({
      total: 4,
      merged: 2,
      live: 1,
      blocked: 1,
      openFixes: 0,
      openSinceShip: 0,
      unstartedSinceShip: 0,
    });
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
      openSinceShip: 0,
      unstartedSinceShip: 0,
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
      // `live` and `openSinceShip` BOTH count it — deliberate, because they answer
      // different questions ("someone is on it" vs "the ratio doesn't cover it").
      // The DATA keeps the overlap so the closure identity holds; the ROW does not
      // show both, because a shipped feature's ratio has no remainder for `live` to
      // be a breakdown of, so `unstartedSinceShip` drops to 0 here.
      expect(p).toEqual({
        total: 1,
        merged: 1,
        live: 1,
        blocked: 0,
        openFixes: 0,
        openSinceShip: 1,
        unstartedSinceShip: 0,
      });
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

  /**
   * §32 t-94. `total`/`merged` exclude exactly two groups — bugs, and work raised
   * after the ship — so each needs a counter or the summary silently under-reports.
   * The owner found this on the first real enhancement filed through the new flow:
   * §20 read `4/4` with an unmerged fifth row sitting in its own task table.
   */
  describe('post-ship work is accounted for, not just excluded', () => {
    it('surfaces an unstarted post-ship enhancement that no other counter catches', () => {
      // THE case. `live` keys off `active` and `blocked` off `blocked`, so both
      // miss a task nobody has started — and since t-89 an enhancement is BORN
      // unassigned, so unstarted is its normal state, not an edge.
      const p = computeFeatureProgress(
        [t('merged', 'feature_work', BEFORE), t('claimed', 'enhancement', AFTER)],
        SHIPPED
      );
      expect(p.live).toBe(0);
      expect(p.blocked).toBe(0);
      expect(p.openFixes).toBe(0);
      expect(p.openSinceShip).toBe(1); // the only counter that sees it
    });

    it('is 0 for an unshipped feature — such work is inside the ratio already', () => {
      const p = computeFeatureProgress([t('claimed', 'enhancement', AFTER)], null);
      expect(p.openSinceShip).toBe(0);
      expect(p.total).toBe(1); // counted, because nothing is "post" an unshipped feature
    });

    it('excludes merged post-ship work — done is not outstanding', () => {
      const p = computeFeatureProgress([t('merged', 'enhancement', AFTER)], SHIPPED);
      expect(p.openSinceShip).toBe(0);
    });

    it('excludes post-ship bugs — those are openFixes, never both', () => {
      const p = computeFeatureProgress([t('claimed', 'bug', AFTER)], SHIPPED);
      expect(p.openFixes).toBe(1);
      expect(p.openSinceShip).toBe(0);
    });

    /**
     * `openSinceShip` is the closure term (everything open past the boundary);
     * `unstartedSinceShip` is the subset the ROW shows, because `live`/`blocked`
     * already carry the started ones. Owner's call: "4/4 · 1 live · 1 new" reads as
     * two outstanding items where there is one, so "new" means post-ship work no
     * other marker is showing.
     */
    describe('started vs unstarted', () => {
      it('counts an unstarted post-ship task in both — nothing else shows it', () => {
        const p = computeFeatureProgress([t('claimed', 'enhancement', AFTER)], SHIPPED);
        expect(p.openSinceShip).toBe(1);
        expect(p.unstartedSinceShip).toBe(1);
        expect(p.live).toBe(0);
        expect(p.blocked).toBe(0);
      });

      it('drops a STARTED post-ship task from unstarted — `live` has it', () => {
        const p = computeFeatureProgress([t('active', 'enhancement', AFTER)], SHIPPED);
        expect(p.live).toBe(1);
        expect(p.openSinceShip).toBe(1); // still closes the accounting
        expect(p.unstartedSinceShip).toBe(0); // …but the row must not double-count it
      });

      it('drops a dependency-blocked post-ship task too — `blocked` has it', () => {
        const p = computeFeatureProgress([t('blocked', 'enhancement', AFTER)], SHIPPED);
        expect(p.blocked).toBe(1);
        expect(p.openSinceShip).toBe(1);
        expect(p.unstartedSinceShip).toBe(0);
      });

      /**
       * The disjointness property the row depends on: what `unstartedSinceShip`
       * shows and what `live`/`blocked` show never describe the same task, so the
       * markers on one row can be read additively.
       */
      it('splits post-ship work so the row markers are disjoint', () => {
        const p = computeFeatureProgress(
          [
            t('claimed', 'enhancement', AFTER),
            t('active', 'enhancement', AFTER),
            t('blocked', 'enhancement', AFTER),
            t('merged', 'enhancement', AFTER), // done — in none of them
          ],
          SHIPPED
        );
        expect(p.openSinceShip).toBe(3);
        expect(p.unstartedSinceShip).toBe(1);
        // The row's post-ship markers add up to the closure term, without overlap.
        expect(p.unstartedSinceShip + p.live + p.blocked).toBe(p.openSinceShip);
      });

      /**
       * Disjoint AND exhaustive for every status the enum can hold — not just the
       * ones that exist today. `unstartedSinceShip` is derived by negation for this
       * reason: a status added later would otherwise fall out of every row marker
       * (not live, not blocked, not new), reintroducing the invisible row t-94
       * exists to prevent. Driven off `Object.values(TaskStatus)`, so it covers a
       * new value without anyone editing this test.
       */
      it('leaves no post-ship status unrepresented on the row, for any status the enum holds', () => {
        for (const status of [...Object.values(TaskStatus), 'blocked'] as EffectiveStatus[]) {
          const p = computeFeatureProgress([t(status, 'enhancement', AFTER)], SHIPPED);
          const shownOnRow = p.unstartedSinceShip + p.live + p.blocked;
          // Merged work is done and shows nowhere; everything else must show once.
          expect(shownOnRow).toBe(status === 'merged' ? 0 : 1);
          expect(shownOnRow).toBe(p.openSinceShip);
        }
      });

      /**
       * The only test that can actually distinguish the negative derivation from
       * `status === 'claimed'`: with today's statuses the two are equivalent, so the
       * property is unobservable until a new value exists. This simulates one.
       *
       * A post-ship task in an unknown status must still be SHOWN. Under the positive
       * form it lands in no marker at all — not live, not blocked, not new — which is
       * exactly the invisible row t-94 exists to prevent, reintroduced by a future
       * enum addition. The cast is the point: it stands in for the value someone adds
       * to `TaskStatus` next.
       */
      it('still shows post-ship work in a status that does not exist yet', () => {
        const future = 'in_review' as EffectiveStatus;
        const p = computeFeatureProgress([t(future, 'enhancement', AFTER)], SHIPPED);
        expect(p.live).toBe(0);
        expect(p.blocked).toBe(0);
        expect(p.unstartedSinceShip).toBe(1); // shown, not swallowed
        expect(p.unstartedSinceShip + p.live + p.blocked).toBe(p.openSinceShip);
      });

      it('never exceeds the closure term it is a subset of', () => {
        const p = computeFeatureProgress(
          [t('claimed', 'enhancement', AFTER), t('claimed', 'feature_work', BEFORE)],
          SHIPPED
        );
        expect(p.unstartedSinceShip).toBeLessThanOrEqual(p.openSinceShip);
        // The pre-ship claimed task is in the ratio, not in either post-ship count.
        expect(p.openSinceShip).toBe(1);
      });
    });

    /**
     * The property that makes the invariant hold **by construction rather than by
     * vigilance**: the three outside-terms are disjoint and exhaustive over the
     * unmerged tasks, so no open task can be invisible. A future kind, or a new
     * exclusion from the ratio, breaks this test rather than quietly hiding a row.
     *
     * `live`/`blocked` are deliberately NOT in the identity — they are descriptive
     * overlays that may overlap any term (an active pre-ship task is both `live`
     * and part of the outstanding `total`), which has always been true.
     */
    it('accounts for every unmerged task exactly once, across an exhaustive matrix', () => {
      const kinds: TaskKind[] = ['feature_work', 'bug', 'enhancement'];
      // Driven off the Prisma enum + the one derived overlay, NOT a hand-list, so a
      // status added later is covered here without anyone remembering — the same
      // seam that let `enhancement` ship unrendered in t-79.
      const statuses: EffectiveStatus[] = [...Object.values(TaskStatus), 'blocked'];
      const dates = [BEFORE, AFTER];

      // Every (kind × status × side-of-boundary) cell, as one feature's task list.
      const tasks = kinds.flatMap((kind) =>
        statuses.flatMap((status) => dates.map((createdAt) => t(status, kind, createdAt)))
      );
      expect(tasks).toHaveLength(24);

      for (const shippedAt of [SHIPPED, null]) {
        const p = computeFeatureProgress(tasks, shippedAt);
        const unmerged = tasks.filter((x) => x.status !== 'merged').length;
        expect(p.total - p.merged + p.openFixes + p.openSinceShip).toBe(unmerged);
      }
    });

    it('holds the same identity on the live §20 shape that exposed the gap', () => {
      const tasks = [
        t('merged', 'feature_work', BEFORE),
        t('merged', 'feature_work', BEFORE),
        t('merged', 'feature_work', BEFORE),
        t('merged', 'feature_work', BEFORE),
        t('claimed', 'enhancement', AFTER), // t-93
      ];
      const p = computeFeatureProgress(tasks, SHIPPED);
      expect(`${p.merged}/${p.total}`).toBe('4/4'); // the ratio stays honest…
      expect(p.openSinceShip).toBe(1); // …and no longer hides the fifth row
      expect(p.total - p.merged + p.openFixes + p.openSinceShip).toBe(1);
    });
  });
});
