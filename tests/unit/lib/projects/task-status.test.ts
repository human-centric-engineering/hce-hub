/**
 * Tests for `lib/projects/task-status.ts` — effective status.
 *
 * This is the shared source of truth for "where does a task really stand?",
 * consumed by `next-task` (and later `f-board-view`), so its edge cases are
 * load-bearing. Two carried findings are pinned here:
 *  - a `claimed` task with a null claimant (erased user) is NOT claimed; and
 *  - an `available` task with an unmerged dependency is `blocked`, not pullable.
 */

import { describe, it, expect } from 'vitest';
import { computeEffectiveStatus, isPullable } from '@/lib/projects/task-status';
import type { TaskStatus } from '@prisma/client';

const dep = (status: TaskStatus) => ({ status });

describe('computeEffectiveStatus', () => {
  it('reports terminal / in-flight stored states verbatim, ignoring deps & claimant', () => {
    expect(
      computeEffectiveStatus({ status: 'merged', claimedByUserId: null }, [dep('backlog')])
    ).toBe('merged');
    expect(
      computeEffectiveStatus({ status: 'in_pr', claimedByUserId: 'u1' }, [dep('backlog')])
    ).toBe('in_pr');
  });

  it('reports claimed only when a live claimant exists', () => {
    expect(computeEffectiveStatus({ status: 'claimed', claimedByUserId: 'u1' }, [])).toBe(
      'claimed'
    );
  });

  it('treats a claimed task with a NULL claimant as unclaimed (erased-user finding)', () => {
    // status stored as 'claimed' but the claimant was erased → SET NULL. With all
    // deps merged it must fall back to the pullable pool, not stick in Claimed.
    expect(computeEffectiveStatus({ status: 'claimed', claimedByUserId: null }, [])).toBe(
      'available'
    );
    // ...and if a dep is unmerged, it's blocked, not claimed.
    expect(
      computeEffectiveStatus({ status: 'claimed', claimedByUserId: null }, [dep('in_pr')])
    ).toBe('blocked');
  });

  it('keeps backlog out of the pullable pool regardless of deps', () => {
    expect(computeEffectiveStatus({ status: 'backlog', claimedByUserId: null }, [])).toBe(
      'backlog'
    );
    expect(
      computeEffectiveStatus({ status: 'backlog', claimedByUserId: null }, [dep('merged')])
    ).toBe('backlog');
  });

  it('is available only when every dependency is merged', () => {
    expect(computeEffectiveStatus({ status: 'available', claimedByUserId: null }, [])).toBe(
      'available'
    );
    expect(
      computeEffectiveStatus({ status: 'available', claimedByUserId: null }, [
        dep('merged'),
        dep('merged'),
      ])
    ).toBe('available');
  });

  it('is blocked when any dependency is not merged (unmerged-PR gate, §5)', () => {
    for (const s of ['backlog', 'available', 'claimed', 'in_pr'] as TaskStatus[]) {
      expect(
        computeEffectiveStatus({ status: 'available', claimedByUserId: null }, [
          dep('merged'),
          dep(s),
        ])
      ).toBe('blocked');
    }
  });
});

describe('isPullable', () => {
  it('is true only for an available effective status', () => {
    expect(isPullable({ status: 'available', claimedByUserId: null }, [dep('merged')])).toBe(true);
    expect(isPullable({ status: 'available', claimedByUserId: null }, [dep('in_pr')])).toBe(false);
    expect(isPullable({ status: 'claimed', claimedByUserId: 'u1' }, [])).toBe(false);
    expect(isPullable({ status: 'backlog', claimedByUserId: null }, [])).toBe(false);
  });
});
