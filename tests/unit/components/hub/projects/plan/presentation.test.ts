/**
 * Unit: Plan presentation helpers (f-plan-view t-2) — status tones, firstName,
 * prLabel edge cases.
 */
import { describe, it, expect } from 'vitest';
import {
  featureStatus,
  taskStatus,
  phaseStatus,
  firstName,
  prLabel,
  shortDate,
} from '@/components/hub/projects/plan/presentation';

describe('featureStatus / taskStatus', () => {
  it('maps feature status to a signal tone + label', () => {
    expect(featureStatus('shipped')).toEqual({ tone: 'merged', label: 'shipped' });
    expect(featureStatus('in_flight')).toEqual({ tone: 'pr', label: 'in flight' });
  });

  it('maps a phase status to a tone, and returns null for parked (rendered muted)', () => {
    expect(phaseStatus('active')).toEqual({ tone: 'active', label: 'active' });
    expect(phaseStatus('upcoming')).toEqual({ tone: 'available', label: 'upcoming' });
    expect(phaseStatus('complete')).toEqual({ tone: 'merged', label: 'complete' });
    expect(phaseStatus('parked')).toBeNull();
  });

  it('maps task effective status, including computed blocked', () => {
    expect(taskStatus('blocked')).toEqual({ tone: 'blocked', label: 'blocked' });
    expect(taskStatus('active')).toEqual({ tone: 'active', label: 'active' });
    expect(taskStatus('claimed')).toEqual({ tone: 'claimed', label: 'assigned' });
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

describe('shortDate (f-phase-history §33 t-99)', () => {
  const now = new Date('2026-08-18T00:00:00.000Z');

  it('omits the year for a date in the current year, so the common case stays compact', () => {
    expect(shortDate('2026-08-03T00:00:00.000Z', now)).not.toMatch(/2026/);
    expect(shortDate('2026-08-03T00:00:00.000Z', now)).toMatch(/Aug/);
  });

  it('includes the year once it differs, so an old phase is not mistaken for a recent one', () => {
    expect(shortDate('2025-08-03T00:00:00.000Z', now)).toMatch(/2025/);
  });

  it('returns empty for an unparseable value rather than "Invalid Date"', () => {
    // `startedAt` crosses the boundary as an unchecked string; a malformed one
    // must degrade to nothing, not render as literal "Invalid Date" in the band.
    expect(shortDate('not-a-date', now)).toBe('');
  });
});
