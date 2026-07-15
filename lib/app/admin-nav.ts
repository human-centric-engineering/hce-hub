/**
 * App admin-sidebar nav registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `components/admin/admin-sidebar.tsx` calls this once at module
 * load (client runtime). Add `registerNavSection({ … })` calls. Keep this file
 * client-safe — registrar + icon imports only, no server code — and use a
 * `title` distinct from the core sections.
 *
 * Full guide + example: CUSTOMIZATION.md §4 · lib/admin-nav/registry.ts
 */
import { FolderKanban } from 'lucide-react';
import { registerNavSection } from '@/lib/admin-nav/registry';

export function initAppNav(): void {
  // HCE Hub — Project Coordination admin (f-project-admin, feature 05).
  // A "Hub" section (a title distinct from the core Overview/Management/AI
  // Orchestration/System sections) grouping the fork's operator surfaces.
  registerNavSection({
    title: 'Hub',
    items: [
      {
        href: '/admin/projects',
        label: 'Projects',
        icon: FolderKanban,
        description: 'Create and manage Hub projects, members, and project knowledge',
      },
    ],
  });
}
