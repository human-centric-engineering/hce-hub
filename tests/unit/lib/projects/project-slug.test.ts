/**
 * Unit: project-slug derivation (f-selfhost-cutover §19 t-3).
 *
 * `slugifyProjectName` is the pure function `createProject` derives a project's
 * shareable URL key from; `PROJECT_SLUG_PATTERN` is the shape the `slug` column
 * (and the `slug` Zod schema) accepts. Both are pure — no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import { slugifyProjectName, PROJECT_SLUG_PATTERN } from '@/lib/projects/project-slug';

describe('slugifyProjectName', () => {
  it('lowercases and hyphenates a simple name', () => {
    expect(slugifyProjectName('HCE Hub')).toBe('hce-hub');
    expect(slugifyProjectName('HCE Website')).toBe('hce-website');
  });

  it('collapses a run of separators into a single hyphen', () => {
    expect(slugifyProjectName('HCE   Hub')).toBe('hce-hub');
    expect(slugifyProjectName('HCE---Hub')).toBe('hce-hub');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifyProjectName('  HCE Hub  ')).toBe('hce-hub');
    expect(slugifyProjectName('-HCE Hub-')).toBe('hce-hub');
    expect(slugifyProjectName('!HCE Hub!')).toBe('hce-hub');
  });

  it('turns mixed punctuation into single hyphens', () => {
    expect(slugifyProjectName("HCE's Hub & Co.")).toBe('hce-s-hub-co');
  });

  it('returns null for a name with no alphanumerics', () => {
    expect(slugifyProjectName('!!!')).toBeNull();
    expect(slugifyProjectName('---')).toBeNull();
  });

  it('returns null for an empty name', () => {
    expect(slugifyProjectName('')).toBeNull();
  });

  it('caps the slug at 100 chars with no trailing hyphen exposed by the cut', () => {
    // 'a' repeated with a space every 4th char, so a cut at 100 could land right
    // after a hyphen — the trailing-hyphen strip must catch that case too.
    const longName = Array.from({ length: 40 }, () => 'word').join(' '); // 4*40 + 39 spaces
    const slug = slugifyProjectName(longName);

    expect(slug).not.toBeNull();
    expect(slug!.length).toBeLessThanOrEqual(100);
    expect(slug!.endsWith('-')).toBe(false);
    expect(slug!.startsWith('-')).toBe(false);
  });
});

describe('PROJECT_SLUG_PATTERN', () => {
  it('accepts lowercase words joined by single hyphens', () => {
    expect(PROJECT_SLUG_PATTERN.test('hce-hub')).toBe(true);
    expect(PROJECT_SLUG_PATTERN.test('a')).toBe(true);
    expect(PROJECT_SLUG_PATTERN.test('a1-b2-c3')).toBe(true);
  });

  it('rejects uppercase, spaces, leading/trailing hyphens, and doubled hyphens', () => {
    expect(PROJECT_SLUG_PATTERN.test('HCE-Hub')).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test('hce hub')).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test('-hce-hub')).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test('hce-hub-')).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test('hce--hub')).toBe(false);
    expect(PROJECT_SLUG_PATTERN.test('')).toBe(false);
  });
});
