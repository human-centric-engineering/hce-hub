/**
 * App public marketing nav overrides.
 *
 * **Fork-owned scaffold** — Sunrise ships every list `null` (= use the platform
 * default) and does NOT change this file after release, so your edits here merge
 * cleanly on upgrade (the stable contract is this file's exports, not their
 * values). Treat it like the landing page: a starting point you're expected to
 * modify.
 *
 * Forks OWN these lists, so the model is *replacement*, not append: set a list
 * to a non-null `PublicNavItem[]` and it **replaces** the platform default
 * wholesale (remove/rename/reorder freely). Leave it `null` to keep the default.
 *
 * Auto-wired: `components/layouts/public-nav.tsx` reads `publicNavItems`;
 * `public-footer.tsx` reads `footerNavItems` and `footerLegalItems`. The
 * `next/link` / active-state glue stays in those platform components.
 *
 * Not overridable: the footer's **Cookie Preferences** control is always
 * rendered by the platform regardless of `footerLegalItems` — this seam governs
 * *links*, not the consent control (a legal requirement in many jurisdictions).
 *
 * Boundary-clean: type-only import, so this stays within the `lib/app/**`
 * framework-agnostic boundary.
 *
 * Full guide: CUSTOMIZATION.md §4 · lib/public-nav/types.ts
 */
import type { PublicNavItem } from '@/lib/public-nav/types';

// HCE Hub is an internal, auth-only app — the public (`(public)`) chrome renders
// only on the retained legal pages (/privacy, /terms, /contact) for signed-out
// visitors. There is no marketing site, so the marketing nav clusters are emptied
// (`[]` replaces the Home/About/Contact defaults wholesale). The legal cluster is
// left at the platform default (`null` → Privacy/Terms), and the Cookie
// Preferences control renders regardless. See f-fork t-1.

/** Header nav — emptied: no marketing navigation on an auth-only app. */
export const publicNavItems: PublicNavItem[] | null = [];

/** Footer link cluster — emptied for the same reason. */
export const footerNavItems: PublicNavItem[] | null = [];

/** Footer legal cluster. `null` = platform default (Privacy/Terms); a non-null
 * array replaces it. The Cookie Preferences control renders regardless. */
export const footerLegalItems: PublicNavItem[] | null = null;
