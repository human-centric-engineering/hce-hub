/**
 * PublicNav default-vs-override (issue #347)
 *
 * The header marketing nav renders `publicNavItems` from the fork-owned
 * `lib/app/public-nav.ts` when non-null, else `DEFAULT_PUBLIC_NAV`. The override
 * list *replaces* the default wholesale. `navItems` is resolved at module load,
 * so the override case stubs the scaffold via `vi.doMock` and re-imports fresh.
 *
 * `usePathname` is globally mocked to '/' (tests/setup.ts), so Home is active.
 *
 * @see components/layouts/public-nav.tsx · lib/app/public-nav.ts · lib/public-nav/types.ts
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import * as React from 'react';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/app/public-nav');
  vi.mocked(usePathname).mockReturnValue('/'); // restore the global mock default
});

describe('PublicNav', () => {
  // Fork divergence: HCE Hub is auth-only and empties the marketing header nav
  // (lib/app/public-nav.ts → `publicNavItems: []`), so the real seam renders NO
  // links — this replaces Sunrise's "renders the platform default links when no
  // override is set" case, whose premise the curation falsifies. The null→default
  // fallback is now vanilla-only and covered upstream. The override-replacement
  // and exact-active-state cases below still exercise the resolver via mocks.
  // See .context/app/platform-divergences.md.
  it("renders the fork's curated (empty) header nav — no marketing links", async () => {
    vi.resetModules();
    const { PublicNav } = await import('@/components/layouts/public-nav');
    render(React.createElement(PublicNav));

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('replaces the default wholesale with a non-null override list', async () => {
    vi.resetModules();
    vi.doMock('@/lib/app/public-nav', () => ({
      publicNavItems: [
        { href: '/pricing', label: 'Pricing' },
        { href: '/docs', label: 'Docs' },
      ],
      footerNavItems: null,
      footerLegalItems: null,
    }));

    const { PublicNav } = await import('@/components/layouts/public-nav');
    render(React.createElement(PublicNav));

    expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute('href', '/pricing');
    expect(screen.getByRole('link', { name: /docs/i })).toHaveAttribute('href', '/docs');
    // Default links are gone — replacement, not append.
    expect(screen.queryByRole('link', { name: /about/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /contact/i })).toBeNull();
  });

  it('an `exact` item is NOT active on child routes', async () => {
    vi.resetModules();
    vi.mocked(usePathname).mockReturnValue('/docs/intro');
    vi.doMock('@/lib/app/public-nav', () => ({
      publicNavItems: [{ href: '/docs', label: 'Docs', exact: true }],
      footerNavItems: null,
      footerLegalItems: null,
    }));

    const { PublicNav } = await import('@/components/layouts/public-nav');
    render(React.createElement(PublicNav));

    // The parent link stays inactive on a nested child path.
    expect(screen.getByRole('link', { name: /docs/i })).not.toHaveAttribute('aria-current', 'page');
  });

  it('a non-exact item prefix-matches child routes (default)', async () => {
    vi.resetModules();
    vi.mocked(usePathname).mockReturnValue('/docs/intro');
    vi.doMock('@/lib/app/public-nav', () => ({
      publicNavItems: [{ href: '/docs', label: 'Docs' }],
      footerNavItems: null,
      footerLegalItems: null,
    }));

    const { PublicNav } = await import('@/components/layouts/public-nav');
    render(React.createElement(PublicNav));

    // Without `exact`, the parent highlights on the child path.
    expect(screen.getByRole('link', { name: /docs/i })).toHaveAttribute('aria-current', 'page');
  });
});
