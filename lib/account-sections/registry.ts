/**
 * Account-section registry (fork-readiness seam).
 *
 * Lets an app built on Sunrise add its own sections to the user's account
 * surface — `/profile` and `/settings` — without editing those `(protected)`
 * route-group pages. Each page renders its core content followed by everything
 * registered here; vanilla Sunrise registers nothing, so the slot is invisible
 * until a fork opts in.
 *
 * **Registration is synchronous and module-import-time.** The pages read the
 * registry during render (not async, no fetch), so an app registers its sections
 * at import time — the same place it wires capabilities / admin-nav / erasure
 * hooks — and the registry is populated before the pages first render. Sections
 * are keyed by `id`, so re-registration under HMR or repeated module imports
 * replaces rather than duplicates, mirroring the sibling registries.
 *
 * @see components/account/account-sections.tsx — the consumer that renders these
 * @see lib/admin-nav/registry.ts — the sibling seam this mirrors
 */
import type { ComponentType } from 'react';

/** A section rendered on the account surface (`/profile` + `/settings`). */
export interface AccountSection {
  /** Stable id — the registry's dedupe key and the rendered React key. */
  id: string;
  /** Lower renders first; sections with no `order` sort after ordered ones. */
  order?: number;
  /** The section body. May be a client component; it receives no props. */
  Component: ComponentType;
}

const sections = new Map<string, AccountSection>();

/**
 * Register an account section. Call at module-import time. Idempotent by `id` —
 * re-registering the same id replaces the prior section (safe under HMR /
 * repeated imports).
 */
export function registerAccountSection(section: AccountSection): void {
  sections.set(section.id, section);
}

/**
 * All registered sections, ordered by `order` (unset sorts last), then
 * first-registration order (JS sort is stable).
 */
export function getRegisteredAccountSections(): AccountSection[] {
  return [...sections.values()].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
}

/** Test-only: clear the registry so each test starts from a known state. */
export function __resetAccountSectionsForTests(): void {
  sections.clear();
}
