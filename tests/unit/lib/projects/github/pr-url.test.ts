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

  it('refuses an owner or repo that would re-point the API request', () => {
    // `#` and `?` are legal in a URL path but turn the REST of the constructed
    // API URL into a fragment or query — so `.../repos/a#b/r/pulls/1` requests
    // `/repos/a`, not what the task's URL named. The host stays api.github.com
    // either way (there is no SSRF here), but a parser should not hand back a
    // ref it cannot honour. GitHub owners and repos are `[A-Za-z0-9._-]` anyway.
    expect(parsePullRequestUrl('https://github.com/a#b/r/pull/1')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/a?x=1/r/pull/1')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/o/r%2Fx/pull/1')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/o/r:8080/pull/1')).toBeNull();
    // …while every character GitHub actually allows still parses.
    expect(parsePullRequestUrl('https://github.com/My-Org.1/repo_name.js/pull/7')).toEqual({
      owner: 'My-Org.1',
      repo: 'repo_name.js',
      number: '7',
    });
  });

  it('accepts the host variants a person can actually paste', () => {
    // `set_pr` only enforces `^https?://`, so all of these are storable and are
    // real, working PR URLs. Rejecting them meant those tasks could never be
    // backfilled and would be re-reported as unparseable on every future run.
    for (const url of [
      'https://www.github.com/o/r/pull/1',
      'https://GitHub.com/o/r/pull/1',
      'https://WWW.GitHub.COM/o/r/pull/1',
    ]) {
      expect(parsePullRequestUrl(url)).toEqual({ owner: 'o', repo: 'r', number: '1' });
    }
  });

  it('refuses a dot-only segment, which the URL parser would RESOLVE away', () => {
    // `.` and `..` pass the character class but are not inert: the constructed
    // `https://api.github.com/repos/o/../pulls/1` normalises to
    // `https://api.github.com/repos/pulls/1` — a different endpoint than the
    // task's URL named. Same class as `#`/`?`, same answer: don't produce the ref.
    expect(parsePullRequestUrl('https://github.com/o/../pull/1')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/../r/pull/1')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/o/./pull/1')).toBeNull();
    expect(parsePullRequestUrl('https://github.com/.../r/pull/1')).toBeNull();
    // A dot INSIDE a name is ordinary and must still parse.
    expect(parsePullRequestUrl('https://github.com/o.rg/r.js/pull/1')).toEqual({
      owner: 'o.rg',
      repo: 'r.js',
      number: '1',
    });
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
