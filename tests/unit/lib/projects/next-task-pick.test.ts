/**
 * Unit: `pickBiasedTask` — the `next_task` bug bias (f-bug-handling §22-02).
 *
 * The bias floats a `bug` above feature-work of equal readiness. It runs over the
 * *already-pullable* list (deps merged, oldest-ready order), so these tests assert
 * only the pick, never dependency-readiness (that's `computeEffectiveStatus`, and
 * lives in the capability's own matrix — this is the pure pick in isolation).
 */
import { describe, it, expect } from 'vitest';
import type { TaskKind } from '@prisma/client';
import { pickBiasedTask } from '@/lib/projects/next-task-pick';

const t = (id: string, kind: TaskKind) => ({ id, kind });

describe('pickBiasedTask', () => {
  it('returns undefined for an empty list', () => {
    expect(pickBiasedTask([])).toBeUndefined();
  });

  it('returns the only task', () => {
    expect(pickBiasedTask([t('a', 'feature_work')])?.id).toBe('a');
  });

  it('prefers a bug over feature-work that sorts ahead of it', () => {
    // The list is in oldest-ready order; the bug is second but still wins.
    expect(pickBiasedTask([t('work', 'feature_work'), t('bug', 'bug')])?.id).toBe('bug');
  });

  it('returns the first (oldest-ready) task when none are bugs', () => {
    expect(pickBiasedTask([t('a', 'feature_work'), t('b', 'feature_work')])?.id).toBe('a');
  });

  it('returns the oldest-ready bug when several bugs are present', () => {
    expect(pickBiasedTask([t('w', 'feature_work'), t('b1', 'bug'), t('b2', 'bug')])?.id).toBe('b1');
  });
});
