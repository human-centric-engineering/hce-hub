/**
 * Tests for `lib/projects/task-status.ts` — effective status (f-status-model §20).
 *
 * This is the shared source of truth for "where does a task really stand?",
 * consumed by `next-task`, the Plan, and the Board, so its edge cases are
 * load-bearing. The stored enum collapsed to `claimed | active | merged` — you
 * claim FEATURES, not tasks, so a task is *born* `claimed`; `active`/`merged` are
 * authoritative regardless of deps, and a `claimed` task is `blocked` only when a
 * dependency isn't yet `merged`.
 */

import { describe, it, expect } from 'vitest';
import { computeEffectiveStatus, isReadyToStart, taskHolderId } from '@/lib/projects/task-status';
import type { TaskStatus } from '@prisma/client';

const dep = (status: TaskStatus) => ({ status });

describe('computeEffectiveStatus', () => {
  it('reports active/merged verbatim, ignoring deps entirely', () => {
    expect(computeEffectiveStatus({ status: 'merged' }, [dep('claimed')])).toBe('merged');
    expect(computeEffectiveStatus({ status: 'active' }, [dep('claimed')])).toBe('active');
  });

  it('is claimed (ready) when there are no dependencies', () => {
    expect(computeEffectiveStatus({ status: 'claimed' }, [])).toBe('claimed');
  });

  it('is claimed (ready) only when every dependency is merged', () => {
    expect(computeEffectiveStatus({ status: 'claimed' }, [dep('merged'), dep('merged')])).toBe(
      'claimed'
    );
  });

  it('is blocked when any dependency is not merged (unmerged-PR gate, §5)', () => {
    for (const s of ['claimed', 'active'] as TaskStatus[]) {
      expect(computeEffectiveStatus({ status: 'claimed' }, [dep('merged'), dep(s)])).toBe(
        'blocked'
      );
    }
  });
});

describe('isReadyToStart', () => {
  it('is true only for an effective claimed status', () => {
    expect(isReadyToStart({ status: 'claimed' }, [dep('merged')])).toBe(true);
    expect(isReadyToStart({ status: 'claimed' }, [dep('active')])).toBe(false);
    expect(isReadyToStart({ status: 'active' }, [])).toBe(false);
    expect(isReadyToStart({ status: 'merged' }, [])).toBe(false);
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
