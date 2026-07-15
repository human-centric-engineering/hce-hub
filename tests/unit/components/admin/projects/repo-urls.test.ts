import { describe, it, expect } from 'vitest';
import { splitRepoUrls, joinRepoUrls } from '@/components/admin/projects/repo-urls';

describe('repo-urls', () => {
  it('splits, trims, and drops blank lines', () => {
    expect(splitRepoUrls('  a\n\n b \n')).toEqual(['a', 'b']);
    expect(splitRepoUrls(undefined)).toEqual([]);
    expect(splitRepoUrls('')).toEqual([]);
  });

  it('joins with newlines (round-trips)', () => {
    expect(joinRepoUrls(['a', 'b'])).toBe('a\nb');
    expect(splitRepoUrls(joinRepoUrls(['x', 'y']))).toEqual(['x', 'y']);
  });
});
