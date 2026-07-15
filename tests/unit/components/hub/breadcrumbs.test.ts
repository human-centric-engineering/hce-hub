/**
 * Breadcrumb derivation tests (f-shell t-2)
 *
 * Route-driven: known segments get pretty labels; unknown ones fall through
 * as-is (the guardrail — new routes get crumbs for free).
 */

import { describe, it, expect } from 'vitest';
import { deriveBreadcrumbs } from '@/components/hub/breadcrumbs';

describe('deriveBreadcrumbs', () => {
  it('root → a single current "Hub" crumb', () => {
    expect(deriveBreadcrumbs('/')).toEqual([{ label: 'Hub' }]);
  });

  it('/projects → Hub(/) › Projects (current)', () => {
    expect(deriveBreadcrumbs('/projects')).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'Projects' },
    ]);
  });

  it('/projects/abc → an un-labelled id leaf is PENDING (skeleton), never the raw id', () => {
    expect(deriveBreadcrumbs('/projects/abc')).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'Projects', href: '/projects' },
      { label: '', href: undefined, pending: true },
    ]);
  });

  it('maps the /brief label', () => {
    expect(deriveBreadcrumbs('/brief')).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'Morning brief' },
    ]);
  });

  it('passes an unknown STATIC segment through as-is (guardrail — not pending)', () => {
    // A leaf that is NOT under a dynamic parent still shows its raw segment.
    expect(deriveBreadcrumbs('/whatever')).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'whatever' },
    ]);
  });

  it('never pulls an inherited Object.prototype member for a prototype-key segment', () => {
    // Top-level (non-dynamic) prototype-key → plain string, not a function/object.
    expect(deriveBreadcrumbs('/toString').at(-1)).toEqual({ label: 'toString' });
    // Under /projects/ it's a pending id leaf — still not a prototype member.
    expect(deriveBreadcrumbs('/projects/constructor').at(-1)).toEqual({
      label: '',
      href: undefined,
      pending: true,
    });
  });

  it('an override labels the id leaf (winning over pending), no skeleton', () => {
    expect(deriveBreadcrumbs('/projects/chubproject', { chubproject: 'HCE Hub' })).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'Projects', href: '/projects' },
      { label: 'HCE Hub', href: undefined },
    ]);
  });
});
