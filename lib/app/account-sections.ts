/**
 * App account-section registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's `initAppAccountSections` export, not its body). Treat
 * it like the other `lib/app/*` seams.
 *
 * Auto-wired: `components/account/account-sections.tsx` calls this once at module
 * load, then renders every section registered here on `/profile` + `/settings`.
 * Add `registerAccountSection({ … })` calls; the section body may be a client
 * component.
 *
 * Full guide: CUSTOMIZATION.md §4 · lib/account-sections/registry.ts
 */
import { registerAccountSection } from '@/lib/account-sections/registry';
import { GithubConnection } from '@/components/hub/account/github-connection';

export function initAppAccountSections(): void {
  // HCE Hub — GitHub identity linking (f-github-identity §23). Lets a member
  // connect/disconnect their GitHub account from their profile + settings.
  registerAccountSection({
    id: 'hub-github-connection',
    order: 10,
    Component: GithubConnection,
  });
}
