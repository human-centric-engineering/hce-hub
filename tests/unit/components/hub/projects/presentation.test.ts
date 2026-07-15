import { describe, it, expect } from 'vitest';
import { STATUS_VARIANT, initials } from '@/components/hub/projects/presentation';

describe('initials', () => {
  it('takes up to two leading letters, skipping extra whitespace', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Cher')).toBe('C');
    expect(initials('a b c')).toBe('AB');
    expect(initials('  Grace   Hopper ')).toBe('GH');
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });
});

describe('STATUS_VARIANT', () => {
  it('maps known statuses', () => {
    expect(STATUS_VARIANT.active).toBe('default');
    expect(STATUS_VARIANT.planning).toBe('secondary');
    expect(STATUS_VARIANT.archived).toBe('outline');
    expect(STATUS_VARIANT.unknown).toBeUndefined();
  });
});
