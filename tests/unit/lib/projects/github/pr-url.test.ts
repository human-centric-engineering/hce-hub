/**
 * Unit: parsePullRequestUrl (§33-sweep t-117) — turning a free-text `Task.prUrl`
 * into the `owner / repo / number` a lookup can use.
 *
 * The stakes are why this is tested at all: the backfill writes whatever merge
 * date the resolved PR reports onto the task. A loose match resolves the wrong
 * repository and writes a plausible-looking, wrong timestamp — a silent
 * corruption, not a visible failure.
 */
import { describe, it, expect } from 'vitest';
import { parsePullRequestUrl } from '@/lib/projects/github/pr-url';

describe('parsePullRequestUrl', () => {
  it('parses a plain PR URL', () => {
    expect(
      parsePullRequestUrl('https://github.com/human-centric-engineering/hce-hub/pull/77')
    ).toEqual({
      owner: 'human-centric-engineering',
      repo: 'hce-hub',
      number: '77',
    });
  });

  it('parses one with a trailing path, query or fragment', () => {
    // All three are what you get from copying the address bar on a PR's Files
    // tab or a review link — the common case, not an edge case.
    for (const suffix of ['/files', '?w=1', '#discussion_r1']) {
      expect(parsePullRequestUrl(`https://github.com/o/r/pull/9${suffix}`)).toEqual({
        owner: 'o',
        repo: 'r',
        number: '9',
      });
    }
  });

  it('refuses a URL that merely CONTAINS a PR URL', () => {
    // The reason the pattern is anchored. Unanchored, this resolves `o/r#1` and
    // writes that PR's merge date — from a host the task never pointed at.
    expect(
      parsePullRequestUrl('https://evil.example/?next=https://github.com/o/r/pull/1')
    ).toBeNull();
  });

  it('refuses a look-alike host', () => {
    expect(parsePullRequestUrl('https://github.com.evil.example/o/r/pull/1')).toBeNull();
    expect(parsePullRequestUrl('https://notgithub.com/o/r/pull/1')).toBeNull();
  });

  it('refuses plain http — no downgrade', () => {
    expect(parsePullRequestUrl('http://github.com/o/r/pull/1')).toBeNull();
  });

  it('refuses non-PR GitHub URLs', () => {
    expect(parsePullRequestUrl('https://github.com/o/r/issues/1')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/o/r')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/o/r/pull/abc')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/o/r/pull/')).toBeNull();
  });

  it('returns null for null, undefined and empty — "cannot look this up"', () => {
    expect(parsePullRequestUrl(null)).toBeNull();
    expect(parsePullRequestUrl(undefined)).toBeNull();
    expect(parsePullRequestUrl('')).toBeNull();
  });

  it('never yields a number that could escape the API path', () => {
    // `number` is interpolated straight into an api.github.com path, so it must
    // be digits or nothing — there is no sanitising step downstream.
    for (const url of [
      'https://github.com/o/r/pull/1/../../secret',
      'https://github.com/o/r/pull/1%2F..',
    ]) {
      const ref = parsePullRequestUrl(url);
      if (ref) expect(ref.number).toMatch(/^\d+$/);
    }
  });
});
