'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/hub/sidebar';
import { Topbar } from '@/components/hub/topbar';
import { SidekickColumn } from '@/components/hub/sidekick-column';
import { BreadcrumbLabelProvider } from '@/components/hub/breadcrumb-label';

/**
 * HubShell — the module-composable three-column frame (f-shell).
 *
 * `240px sidebar | 1fr main` collapsing to `… | 380px sidekick` when the sidekick
 * is toggled open. Owns the sidekick-open state; because the shell renders inside
 * `app/(hub)/layout.tsx` (which does not remount on child navigation), that state
 * — and the sidekick column — persist across main-column nav, per the design.
 *
 * Module-agnostic (the composable-shell guardrail): no project/module assumption
 * baked in, so account pages could re-parent under it later without a rewrite.
 * The sidebar nav is registry-driven; breadcrumb leaf labels are page-supplied
 * via a generic `BreadcrumbLabelProvider` (any module writes to it); the sidekick
 * content lands in `f-sidekick`.
 */
export interface HubShellUser {
  name: string;
  email: string;
  image: string | null;
  role: string | null;
}

export function HubShell({
  user,
  children,
}: {
  user: HubShellUser;
  children: React.ReactNode;
}): React.ReactNode {
  const [sidekickOpen, setSidekickOpen] = useState(false);

  return (
    <BreadcrumbLabelProvider>
      <div
        className={`bg-background text-foreground grid min-h-screen ${
          sidekickOpen ? 'grid-cols-[240px_1fr_380px]' : 'grid-cols-[240px_1fr]'
        }`}
      >
        <Sidebar user={user} />

        <div className="flex min-w-0 flex-col">
          <Topbar sidekickOpen={sidekickOpen} onToggleSidekick={() => setSidekickOpen((o) => !o)} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>

        {sidekickOpen && <SidekickColumn />}
      </div>
    </BreadcrumbLabelProvider>
  );
}
