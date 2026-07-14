/**
 * Hub module registry tests (f-shell t-2)
 *
 * The composability primitive: modules register at import time, keyed by slug
 * (idempotent). Vitest isolates test files, so the built-ins are present fresh.
 */

import { describe, it, expect } from 'vitest';
import { Star } from 'lucide-react';
import { registerHubModule, getHubModules } from '@/lib/app/hub-modules';

describe('hub-modules registry', () => {
  it('registers the built-in modules (Projects active; the rest stubbed)', () => {
    const mods = getHubModules();
    expect(mods.find((m) => m.slug === 'projects')).toMatchObject({
      label: 'Projects',
      href: '/projects',
      status: 'active',
    });
    expect(mods.filter((m) => m.status === 'soon').map((m) => m.slug)).toEqual(
      expect.arrayContaining(['sales', 'support', 'knowledge'])
    );
  });

  it('registers a new module and dedupes by slug (last write wins)', () => {
    registerHubModule({
      slug: 'unit-mod',
      label: 'First',
      icon: Star,
      href: '/x',
      status: 'active',
    });
    registerHubModule({
      slug: 'unit-mod',
      label: 'Second',
      icon: Star,
      href: '/y',
      status: 'active',
    });

    const matches = getHubModules().filter((m) => m.slug === 'unit-mod');
    expect(matches).toHaveLength(1);
    expect(matches[0].label).toBe('Second');
  });
});
