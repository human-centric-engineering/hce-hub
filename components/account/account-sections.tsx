/**
 * Renders the fork-registered account sections on `/profile` + `/settings`.
 *
 * The consumer side of the account-section seam (see
 * `lib/account-sections/registry.ts`). Vanilla Sunrise registers no sections, so
 * this renders `null` and the pages are unchanged; a fork adds sections via
 * `lib/app/account-sections.ts`, loaded here once at module import — the same
 * wiring `admin-sidebar.tsx` uses for `initAppNav()`.
 */
import { initAppAccountSections } from '@/lib/app/account-sections';
import { getRegisteredAccountSections } from '@/lib/account-sections/registry';

// Populate the registry once (module-import time), before any page renders it.
initAppAccountSections();

export function AccountSections() {
  const sections = getRegisteredAccountSections();
  if (sections.length === 0) return null;
  return (
    <div className="space-y-6">
      {sections.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </div>
  );
}
