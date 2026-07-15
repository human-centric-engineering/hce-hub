'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Bell, PanelRight } from 'lucide-react';
import { deriveBreadcrumbs } from '@/components/hub/breadcrumbs';
import { useBreadcrumbLabels } from '@/components/hub/breadcrumb-label';

/**
 * Hub topbar (f-shell) — route-derived breadcrumbs · ⌘K trigger · bell · sidekick
 * toggle. The ⌘K trigger is a control only; the command palette itself is a
 * follow-up (per the design). The bell has no red badge (§13.5).
 */
export function Topbar({
  sidekickOpen,
  onToggleSidekick,
}: {
  sidekickOpen: boolean;
  onToggleSidekick: () => void;
}): React.ReactNode {
  const pathname = usePathname();
  const crumbs = deriveBreadcrumbs(pathname, useBreadcrumbLabels());

  return (
    <header className="border-border bg-background sticky top-0 z-10 flex h-[52px] items-center gap-4 border-b px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        {crumbs.map((crumb, i) => (
          <Fragment key={`${crumb.label}-${i}`}>
            {i > 0 && <span className="text-muted-foreground/50">/</span>}
            {crumb.href ? (
              <Link href={crumb.href} className="text-muted-foreground hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{crumb.label}</span>
            )}
          </Fragment>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        className="border-border bg-card text-muted-foreground hover:border-foreground/25 flex min-w-[220px] items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px] transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Ask the sidekick or jump to…</span>
        <kbd
          className="bg-accent text-muted-foreground border-border ml-auto rounded border px-1.5 text-[10px]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          ⌘K
        </kbd>
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Notifications"
          className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md transition-colors"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Toggle sidekick"
          aria-pressed={sidekickOpen}
          onClick={onToggleSidekick}
          className="text-muted-foreground hover:bg-accent hover:text-foreground grid h-7 w-7 place-items-center rounded-md transition-colors"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
