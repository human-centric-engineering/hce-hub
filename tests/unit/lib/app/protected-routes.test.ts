/**
 * Guards the fork's fill of the `appProtectedRoutes` edge seam (f-access).
 *
 * This array is a security boundary: `proxy.ts` redirects any signed-out
 * request whose path `startsWith` a listed prefix to `/login`. A stray or
 * mistyped entry would silently change which routes the edge gate protects, so
 * we assert the EXACT set — the same guard the ESLint-seam case in
 * `defaults.test.ts` applies. HCE Hub (fork) intentionally fills this; vanilla
 * Sunrise ships `[]`. See `lib/app/protected-routes.ts`,
 * `.context/app/planning/f-access.md`.
 */

import { describe, it, expect } from 'vitest';
import { appProtectedRoutes } from '@/lib/app/protected-routes';

describe('appProtectedRoutes (fork fill)', () => {
  it('protects exactly the Hub project surface', () => {
    // `/projects` is the only prefix f-access registers; other Hub sections
    // (e.g. `/brief`) register their own prefix with the feature that adds them.
    // Asserting the exact array means a stray addition fails here rather than
    // silently widening the signed-out redirect.
    expect(appProtectedRoutes).toEqual(['/projects']);
  });

  it('carries only well-formed leading-slash prefixes the proxy will honor', () => {
    // proxy.ts drops non-`/`-prefixed / empty entries; keep the source clean so
    // nothing depends on that defensive filtering.
    for (const route of appProtectedRoutes) {
      expect(route.startsWith('/')).toBe(true);
      expect(route.length).toBeGreaterThan(1);
    }
  });
});
