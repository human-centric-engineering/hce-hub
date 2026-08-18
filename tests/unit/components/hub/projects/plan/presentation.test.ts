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
  it('formats UTC, locale-free — the same string on the server and in any browser', () => {
    // toLocaleDateString would emit "Aug 1" on a Vercel en-US server and "1 Aug"
    // in an en-GB browser: a hydration mismatch on every band with a start date.
    expect(shortDate('2026-08-01T00:00:00.000Z')).toBe('1 Aug 2026');
  });

  it('does not shift a UTC-stamped date into the viewer timezone', () => {
    // The timestamps are stamped at UTC. Formatted in local time, midnight-UTC
    // renders as the PREVIOUS day for anyone west of Greenwich — silently wrong.
    expect(shortDate('2026-08-01T00:00:00.000Z')).toContain('1 Aug');
    expect(shortDate('2026-08-01T23:59:59.000Z')).toContain('1 Aug');
  });

  it('always carries the year, so it cannot differ across a year boundary', () => {
    // A "hide the year when it matches now" rule would itself be non-deterministic
    // between a server and a client evaluating "now" either side of midnight.
    expect(shortDate('2025-12-31T00:00:00.000Z')).toBe('31 Dec 2025');
  });

  it('returns empty for an unparseable value rather than "Invalid Date"', () => {
    expect(shortDate('not-a-date')).toBe('');
  });
});
