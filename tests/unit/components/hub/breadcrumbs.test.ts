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

  it('/projects/abc → Hub(/) › Projects(/projects) › abc (current)', () => {
    expect(deriveBreadcrumbs('/projects/abc')).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'Projects', href: '/projects' },
      { label: 'abc' },
    ]);
  });

  it('maps the /brief label', () => {
    expect(deriveBreadcrumbs('/brief')).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'Morning brief' },
    ]);
  });

  it('passes an unknown segment through as-is (guardrail)', () => {
    expect(deriveBreadcrumbs('/whatever')).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'whatever' },
    ]);
  });

  it('treats Object.prototype-key segments as plain strings, not inherited members', () => {
    // e.g. a project id of `constructor` / `toString` at /projects/<id>
    for (const key of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
      const crumbs = deriveBreadcrumbs(`/projects/${key}`);
      expect(crumbs[crumbs.length - 1]).toEqual({ label: key });
    }
  });

  it('an override labels a dynamic segment (project id → name), winning over the raw id', () => {
    expect(deriveBreadcrumbs('/projects/chubproject', { chubproject: 'HCE Hub' })).toEqual([
      { label: 'Hub', href: '/' },
      { label: 'Projects', href: '/projects' },
      { label: 'HCE Hub' },
    ]);
  });

  it('an Object.prototype-key override is still treated as a plain lookup', () => {
    // A malicious segment `toString` with no override must not pull a prototype member.
    expect(deriveBreadcrumbs('/projects/toString', { chubproject: 'HCE Hub' }).at(-1)).toEqual({
      label: 'toString',
    });
  });
});
