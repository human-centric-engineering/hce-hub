/**
 * Unit: readiness-derived feature status (f-status-model §20 t-37).
 * @see lib/projects/feature-status.ts
 */
import { describe, it, expect } from 'vitest';
import { computeFeatureStatus } from '@/lib/projects/feature-status';
import type { FeatureStatusDep } from '@/lib/projects/feature-status';

const dep = (
  status: FeatureStatusDep['status'],
  slug: string | null = slugFor(status)
): FeatureStatusDep => ({
  status,
  slug,
  title: `Feature ${slug ?? status}`,
});

function slugFor(status: string): string {
  return `f-${status}`;
}

describe('computeFeatureStatus', () => {
  it('passes shipped straight through, no waiting-on', () => {
    expect(computeFeatureStatus('shipped', [dep('planning')])).toEqual({
      status: 'shipped',
      waitingOn: [],
    });
  });

  it('passes in_flight straight through (a claimed feature is being worked)', () => {
    expect(computeFeatureStatus('in_flight', [dep('planning')])).toEqual({
      status: 'in_flight',
      waitingOn: [],
    });
  });

  it('a not-started feature with no dependencies is available', () => {
    expect(computeFeatureStatus('planning', [])).toEqual({ status: 'available', waitingOn: [] });
  });

  it('a not-started feature whose every dependency has shipped is available', () => {
    expect(computeFeatureStatus('planning', [dep('shipped'), dep('shipped')])).toEqual({
      status: 'available',
      waitingOn: [],
    });
  });

  it('a not-started feature with an unshipped dependency is blocked, naming it', () => {
    const result = computeFeatureStatus('planning', [
      dep('shipped', 'f-done'),
      dep('in_flight', 'f-wip'),
      dep('planning', 'f-todo'),
    ]);
    expect(result.status).toBe('blocked');
    // Only the two unshipped deps are surfaced as the blockers.
    expect(result.waitingOn.map((w) => w.slug)).toEqual(['f-wip', 'f-todo']);
  });

  it('carries a title fallback for an unshipped dep with no slug', () => {
    const result = computeFeatureStatus('planning', [
      { status: 'planning', slug: null, title: 'Unnamed feature' },
    ]);
    expect(result.status).toBe('blocked');
    expect(result.waitingOn).toEqual([{ slug: null, title: 'Unnamed feature' }]);
  });

  it('folds the reserved stored `blocked` into the derived readiness verdict', () => {
    // The stored `blocked` enum value is parked/unused; treat it as un-started.
    expect(computeFeatureStatus('blocked', [dep('shipped')])).toEqual({
      status: 'available',
      waitingOn: [],
    });
    expect(computeFeatureStatus('blocked', [dep('planning', 'f-x')]).status).toBe('blocked');
  });
});
