import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { ProjectTab } from '@/components/hub/projects/types';

const TABS: { key: ProjectTab; label: string }[] = [
  { key: 'plan', label: 'Plan' },
  { key: 'board', label: 'Board' },
  { key: 'log', label: 'Log' },
];

/**
 * The Plan⇄Board⇄Log tab control. The active view is part of the URL (`?view=`)
 * so a tab is linkable/shareable and survives refresh; the tab *content* arrives
 * with `f-plan-view` (§09), `f-board-view` (§10), and the journal Log
 * (`f-journal` §17).
 */
export function ProjectViewTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  return (
    <div className="border-b" role="tablist" aria-label="Project view">
      {TABS.map((t) => (
        <Link
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          href={`/projects/${projectId}?view=${t.key}`}
          className={cn(
            'focus-visible:ring-ring -mb-px inline-block border-b-2 px-4 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
            active === t.key
              ? 'border-foreground text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground border-transparent'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
