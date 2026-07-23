/**
 * Unit: Plan presentation helpers (f-plan-view t-2) — status tones, firstName,
 * prLabel edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  featureStatus,
  taskStatus,
  firstName,
  prLabel,
} from '@/components/hub/projects/plan/presentation';

describe('featureStatus / taskStatus', () => {
  it('maps feature status to a signal tone + label', () => {
    expect(featureStatus('shipped')).toEqual({ tone: 'merged', label: 'shipped' });
    expect(featureStatus('in_flight')).toEqual({ tone: 'pr', label: 'in flight' });
  });

  it('maps task effective status, including computed blocked', () => {
    expect(taskStatus('blocked')).toEqual({ tone: 'blocked', label: 'blocked' });
    expect(taskStatus('active')).toEqual({ tone: 'active', label: 'active' });
    expect(taskStatus('claimed')).toEqual({ tone: 'claimed', label: 'claimed' });
    expect(taskStatus('merged')).toEqual({ tone: 'merged', label: 'merged' });
  });
});

describe('firstName', () => {
  it('returns the first token', () => {
    expect(firstName('Grace Hopper')).toBe('Grace');
  });

  it('returns the whole string for a single name', () => {
    expect(firstName('Cher')).toBe('Cher');
  });

  it('falls back to the input when it is only whitespace', () => {
    expect(firstName('   ')).toBe('   ');
  });
});

describe('prLabel', () => {
  it('#-prefixes a numeric trailing segment (GitHub PR url)', () => {
    expect(prLabel('https://github.com/o/r/pull/44')).toBe('#44');
  });

  it('returns a non-numeric trailing segment as-is', () => {
    expect(prLabel('https://example.com/branch/feature-x')).toBe('feature-x');
  });

  it('tolerates a trailing slash', () => {
    expect(prLabel('https://github.com/o/r/pull/44/')).toBe('#44');
  });
});
