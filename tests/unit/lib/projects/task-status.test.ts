/**
 * Tests for `lib/projects/task-status.ts` — effective status (f-status-model §20).
 *
 * This is the shared source of truth for "where does a task really stand?",
 * consumed by `next-task`, the Plan, and the Board, so its edge cases are
 * load-bearing. The stored enum collapsed to `claimed | active | merged` — you
 * claim FEATURES, not tasks, so a task is *born* `claimed`; `active`/`merged` are
 * authoritative regardless of deps, and a `claimed` task is `blocked` only when a
 * dependency isn't yet `merged`.
 *
 * §21 t-123 adds the second computed-only value, `withdrawn` — the work is not going
 * to happen — plus the rule that a withdrawn DEPENDENCY stops blocking, since it can
 * never reach `merged`.
 */

import { describe, it, expect } from 'vitest';
import { computeEffectiveStatus, isReadyToStart, taskHolderId } from '@/lib/projects/task-status';
import type { TaskStatus } from '@prisma/client';

const dep = (status: TaskStatus) => ({ status, withdrawnAt: null });
/** A dependency that was called off — it can never merge, so it must not block. */
const withdrawnDep = (status: TaskStatus = 'claimed') => ({ status, withdrawnAt: new Date() });
/** A live task in the given stored state. */
const live = (status: TaskStatus) => ({ status, withdrawnAt: null });
/** A task that was withdrawn while in the given stored state. */
const gone = (status: TaskStatus) => ({ status, withdrawnAt: new Date() });

describe('computeEffectiveStatus', () => {
  it('reports active/merged verbatim, ignoring deps entirely', () => {
    expect(computeEffectiveStatus(live('merged'), [dep('claimed')])).toBe('merged');
    expect(computeEffectiveStatus(live('active'), [dep('claimed')])).toBe('active');
  });

  it('is claimed (ready) when there are no dependencies', () => {
    expect(computeEffectiveStatus(live('claimed'), [])).toBe('claimed');
  });

  it('is claimed (ready) only when every dependency is merged', () => {
    expect(computeEffectiveStatus(live('claimed'), [dep('merged'), dep('merged')])).toBe('claimed');
  });

  it('is blocked when any dependency is not merged (unmerged-PR gate, §5)', () => {
    for (const s of ['claimed', 'active'] as TaskStatus[]) {
      expect(computeEffectiveStatus(live('claimed'), [dep('merged'), dep(s)])).toBe('blocked');
    }
  });

  it('reports withdrawn for a task called off in any open state (§21 t-123)', () => {
    for (const s of ['claimed', 'active'] as TaskStatus[]) {
      expect(computeEffectiveStatus(gone(s), [])).toBe('withdrawn');
    }
  });

  it('withdrawn beats blocked — a called-off task is not waiting for anything', () => {
    // Otherwise a withdrawn task with an unmerged dependency would read `blocked`,
    // i.e. "start this once the dep lands", which is the opposite of the truth.
    expect(computeEffectiveStatus(gone('claimed'), [dep('claimed')])).toBe('withdrawn');
  });

  it('merged wins over withdrawn — the impossible row fails visibly, not silently', () => {
    // `withdrawTask` refuses a merged task, so this pair cannot occur. The order
    // decides which way an inconsistent row would break: reading it `merged` shows
    // finished work as finished, while `withdrawn` would drop it out of its
    // feature's completion count and off every surface at once.
    expect(computeEffectiveStatus(gone('merged'), [])).toBe('merged');
  });

  it('a WITHDRAWN dependency does not block — it can never merge', () => {
    // The trap this avoids: treating it as outstanding leaves every dependent
    // permanently blocked, with deleting the edge as the only escape.
    expect(computeEffectiveStatus(live('claimed'), [withdrawnDep('claimed')])).toBe('claimed');
    expect(computeEffectiveStatus(live('claimed'), [withdrawnDep('active')])).toBe('claimed');
  });

  it('still blocks on a live dependency alongside a withdrawn one', () => {
    // The withdrawn edge is discounted, not the whole dependency set.
    expect(computeEffectiveStatus(live('claimed'), [withdrawnDep(), dep('claimed')])).toBe(
      'blocked'
    );
  });
});

describe('isReadyToStart', () => {
  it('is true only for an effective claimed status', () => {
    expect(isReadyToStart(live('claimed'), [dep('merged')])).toBe(true);
    expect(isReadyToStart(live('claimed'), [dep('active')])).toBe(false);
    expect(isReadyToStart(live('active'), [])).toBe(false);
    expect(isReadyToStart(live('merged'), [])).toBe(false);
  });
});

describe('taskHolderId (f-task-assignment §22 t2)', () => {
  it('shows the assignee while the task is open (claimed / active / blocked)', () => {
    for (const s of ['claimed', 'active', 'blocked'] as const) {
      // claimer ≠ assignee (the someone-else-started edge) → the assignee wins.
      expect(taskHolderId(s, 'claimer', 'assignee')).toBe('assignee');
    }
  });

  it('shows the doer (claimant) once merged — credit, not the last assignee', () => {
    // A merged task credits whoever did it, even if it was later reassigned.
    expect(taskHolderId('merged', 'doer', 'assignee')).toBe('doer');
  });

  it('falls back to the claimant on an open task with no assignee (defensive)', () => {
    expect(taskHolderId('claimed', 'claimer', null)).toBe('claimer');
  });

  it('is null when neither is set (unassigned / erased)', () => {
    expect(taskHolderId('claimed', null, null)).toBeNull();
    // A merged task with an erased doer is null even if an assignee lingers.
    expect(taskHolderId('merged', null, 'assignee')).toBeNull();
  });
});
