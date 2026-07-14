/**
 * Hub module registry (fork-owned).
 *
 * The composability primitive behind the shell sidebar's **Modules** section:
 * the nav is driven by this registry, so adding a module (a future Sales /
 * Support / Knowledge surface, or a whole Module 2) is a `registerHubModule()`
 * call + a route folder — never an edit to `components/hub/sidebar.tsx`. This is
 * the §2/§15 module-composability expressed as data.
 *
 * Mirrors the `lib/admin-nav/registry.ts` idiom: **registration is synchronous
 * and module-import-time** (the sidebar is a `'use client'` component that reads
 * the registry during render — not async, no fetch), and the registry is a `Map`
 * keyed by `slug`, so re-registration under HMR / repeated imports replaces
 * rather than duplicates. Unlike `admin-nav` (a Sunrise seam a fork *fills*),
 * this is entirely the Hub's own concept, so the built-in modules are registered
 * here at module load rather than via an empty scaffold.
 *
 * Boundary-clean for `lib/app/**`: data + `lucide-react` icon components only,
 * no `next/*` — the sidebar component supplies the `<Link>`.
 *
 * @see components/hub/sidebar.tsx — the consumer that renders these
 */

import type { ComponentType } from 'react';
import { FolderKanban, TrendingUp, LifeBuoy, BookOpen } from 'lucide-react';

/** `active` = a live surface (a real `href`); `soon` = visibly stubbed, not yet built. */
export type HubModuleStatus = 'active' | 'soon';

export interface HubModule {
  /** Stable id + registry key. */
  slug: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Where the module mounts (ignored for `soon` modules). */
  href: string;
  status: HubModuleStatus;
}

const modules = new Map<string, HubModule>();

/**
 * Register a Hub module. Call at module-import time. Idempotent by `slug`
 * (re-registering the same slug replaces it — safe under HMR / repeated imports).
 * Modules render in first-registration order.
 */
export function registerHubModule(module: HubModule): void {
  modules.set(module.slug, module);
}

/** The registered modules, in registration order. */
export function getHubModules(): HubModule[] {
  return [...modules.values()];
}

// Built-in Hub modules. Projects is live; the rest are visibly stubbed — the
// signal that the shell nav is not hard-wired to Projects (a Module 2 is a
// registration, not a shell rewrite).
registerHubModule({
  slug: 'projects',
  label: 'Projects',
  icon: FolderKanban,
  href: '/projects',
  status: 'active',
});
registerHubModule({ slug: 'sales', label: 'Sales', icon: TrendingUp, href: '#', status: 'soon' });
registerHubModule({ slug: 'support', label: 'Support', icon: LifeBuoy, href: '#', status: 'soon' });
registerHubModule({
  slug: 'knowledge',
  label: 'Knowledge',
  icon: BookOpen,
  href: '#',
  status: 'soon',
});
