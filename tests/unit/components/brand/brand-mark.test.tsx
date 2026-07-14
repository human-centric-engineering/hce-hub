/**
 * BrandMark slot (Sunrise issue #347 · adapted for HCE Hub f-theme)
 *
 * Sunrise ships this test asserting the scaffold's DEFAULT behaviour (a bare
 * `BRAND.name` string, no wrapper element). HCE Hub fills the fork-owned
 * scaffold with the design handoff's brand mark (a "H" square + wordmark), so
 * these assertions are adapted to the fork's render. `BRAND.name` is read from
 * `NEXT_PUBLIC_APP_NAME` at module load, so each case stubs the env and
 * re-imports fresh. Recorded in .context/app/platform-divergences.md.
 *
 * @see components/brand/brand-mark.tsx · lib/brand.ts · .context/app/planning/f-theme.md
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as React from 'react';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function renderBrandMark(appName?: string): Promise<HTMLElement> {
  vi.resetModules();
  if (appName !== undefined) vi.stubEnv('NEXT_PUBLIC_APP_NAME', appName);
  const { BrandMark } = await import('@/components/brand/brand-mark');
  const { container } = render(React.createElement(BrandMark));
  return container;
}

describe('BrandMark (HCE Hub — f-theme)', () => {
  it('exposes the configured brand name as the accessible name', async () => {
    const container = await renderBrandMark('Acme');
    expect(container.querySelector('[aria-label="Acme"]')).not.toBeNull();
  });

  it('falls back to the default brand name when NEXT_PUBLIC_APP_NAME is unset', async () => {
    const container = await renderBrandMark();
    expect(container.querySelector('[aria-label="Sunrise"]')).not.toBeNull();
  });

  it('renders the visible wordmark carrying the brand name', async () => {
    const container = await renderBrandMark('Acme');
    expect(container.textContent).toContain('Acme');
  });

  it('renders the "H" mark as decorative (aria-hidden), not part of the accessible name', async () => {
    const container = await renderBrandMark('Acme');
    const mark = container.querySelector('[aria-hidden="true"]');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('H');
  });
});
