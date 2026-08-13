/**
 * Tests for the account-section registry (f-github-identity §23 t-75) — the
 * fork-readiness seam that lets a fork add sections to /profile + /settings.
 * Pins idempotency-by-id, order sorting (unset last), and reset.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAccountSection,
  getRegisteredAccountSections,
  __resetAccountSectionsForTests,
} from '@/lib/account-sections/registry';

const A = () => null;
const B = () => null;
const C = () => null;

beforeEach(() => __resetAccountSectionsForTests());

describe('account-sections registry', () => {
  it('registers and returns a section', () => {
    registerAccountSection({ id: 'a', Component: A });
    expect(getRegisteredAccountSections().map((s) => s.id)).toEqual(['a']);
  });

  it('is idempotent by id — re-registering replaces rather than duplicates', () => {
    registerAccountSection({ id: 'a', Component: A });
    registerAccountSection({ id: 'a', Component: B });
    const sections = getRegisteredAccountSections();
    expect(sections).toHaveLength(1);
    expect(sections[0].Component).toBe(B);
  });

  it('orders by `order` (unset sorts last), stable within equal order', () => {
    registerAccountSection({ id: 'x', order: 20, Component: A });
    registerAccountSection({ id: 'unset', Component: B });
    registerAccountSection({ id: 'y', order: 10, Component: C });
    expect(getRegisteredAccountSections().map((s) => s.id)).toEqual(['y', 'x', 'unset']);
  });

  it('reset clears the registry', () => {
    registerAccountSection({ id: 'a', Component: A });
    __resetAccountSectionsForTests();
    expect(getRegisteredAccountSections()).toEqual([]);
  });
});
