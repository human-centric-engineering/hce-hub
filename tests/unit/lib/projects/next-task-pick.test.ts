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
import { pickBiasedTask, pickFocusedTask } from '@/lib/projects/next-task-pick';

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

/**
 * Unit: `pickFocusedTask` — the focus policy (f-work-kinds §32 t-90).
 *
 * Own work before the commons, with the bug bias applying *within* the chosen tier.
 * The caller supplies `isOwnWork`, so this module never learns about users — which
 * is what will let the dynamic-focus work swap the tier order without touching it.
 */
describe('pickFocusedTask', () => {
  /** `own`-prefixed ids are the caller's; everything else is the commons. */
  const mine = (x: { id: string }) => x.id.startsWith('own');

  it('returns undefined for an empty list', () => {
    expect(pickFocusedTask([], mine)).toBeUndefined();
  });

  it('prefers own work over a commons task that sorts ahead of it', () => {
    expect(
      pickFocusedTask([t('commons', 'feature_work'), t('own-a', 'feature_work')], mine)?.id
    ).toBe('own-a');
  });

  it('falls through to the commons when no own work is ready', () => {
    expect(pickFocusedTask([t('commons-a', 'feature_work'), t('commons-b', 'bug')], mine)?.id).toBe(
      'commons-b'
    );
  });

  it('keeps the bug bias inside the own tier', () => {
    expect(pickFocusedTask([t('own-work', 'feature_work'), t('own-bug', 'bug')], mine)?.id).toBe(
      'own-bug'
    );
  });

  it('does NOT let a commons bug outrank ready own feature-work', () => {
    // The whole point of tiering rather than one flat bug-biased set: a bug sweep
    // is a mode you choose, not an interruption next_task pushes at you.
    expect(
      pickFocusedTask([t('commons-bug', 'bug'), t('own-work', 'feature_work')], mine)?.id
    ).toBe('own-work');
  });

  it('preserves the incoming (oldest-ready) order within each tier', () => {
    const picked = pickFocusedTask(
      [t('commons-a', 'feature_work'), t('own-a', 'feature_work'), t('own-b', 'feature_work')],
      mine
    );
    expect(picked?.id).toBe('own-a');
  });

  it('degenerates to the plain bias when everything is own work', () => {
    const list = [t('own-a', 'feature_work'), t('own-bug', 'bug')];
    expect(pickFocusedTask(list, mine)?.id).toBe(pickBiasedTask(list)?.id);
  });

  it('degenerates to the plain bias when nothing is own work', () => {
    const list = [t('c-a', 'feature_work'), t('c-bug', 'bug')];
    expect(pickFocusedTask(list, mine)?.id).toBe(pickBiasedTask(list)?.id);
  });
});
