'use client';

/**
 * The active-fixes strip (f-bug-handling §22-02 t2).
 *
 * A pinned, project-scoped band above the Plan/Board body listing every open
 * `bug`-kind task in the project, each with a breadcrumb to the feature (and
 * phase) it lives on. It sits above the phase-grouped body precisely to signal a
 * *different axis* — fixes pulled from any phase — and being project-scoped it
 * survives the no-active-phase case. It is a **reference** band: it points at the
 * bug and opens its fix task; it never pulls the origin feature forward.
 *
 * Self-hiding: renders nothing when there are no open fixes (empty → gone). The
 * header toggles the list collapsed (persisted) so a long list can be tucked away
 * while you work features first — the count stays visible either way.
 */
import { Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { ActiveFixDTO } from '@/components/hub/projects/types';

export function ActiveFixesStrip({ fixes }: { fixes: ActiveFixDTO[] }) {
  const { open } = useTaskSheet();
  const [collapsed, setCollapsed] = useLocalStorage('hub:active-fixes-collapsed', false);
  if (fixes.length === 0) return null;

  return (
    <section
      aria-label="Active fixes"
      className="rounded-lg border px-4 py-3"
      style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-tint)' }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show active fixes' : 'Hide active fixes'}
        className={`flex w-full items-center gap-2 ${collapsed ? '' : 'mb-2'}`}
      >
        {/* A wrench, not a red alarm — a bug is a fix to pull, not a crisis (anti-urgency). */}
        <Wrench className="h-3.5 w-3.5" style={{ color: 'var(--signal-blocked)' }} aria-hidden />
        <span className="text-[12px] font-medium" style={{ color: 'var(--ink-soft)' }}>
          Active fixes · {fixes.length}
        </span>
        {collapsed ? (
          <ChevronRight
            className="ml-auto h-4 w-4"
            style={{ color: 'var(--ink-faint)' }}
            aria-hidden
          />
        ) : (
          <ChevronDown
            className="ml-auto h-4 w-4"
            style={{ color: 'var(--ink-faint)' }}
            aria-hidden
          />
        )}
      </button>
      {!collapsed && (
        <ul className="flex flex-col gap-0.5">
          {fixes.map((f) => (
            <li key={f.taskId}>
              <button
                type="button"
                onClick={() => open(f.taskId)}
                className="flex w-full items-baseline justify-between gap-3 rounded px-1.5 py-1 text-left text-[13px] hover:bg-[var(--bg-elev)]"
              >
                <span className="min-w-0 truncate" style={{ color: 'var(--ink-soft)' }}>
                  {f.taskNumber != null && (
                    <span
                      className="mr-1.5 font-mono text-[11px]"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      t-{f.taskNumber}
                    </span>
                  )}
                  {f.title}
                </span>
                {/* Origin breadcrumb: feature (slug fallback title) · phase, with a ↩
                    to signal "reference back" — the fix lives on that feature/phase. */}
                <span
                  className="shrink-0 font-mono text-[11px]"
                  style={{ color: 'var(--ink-faint)' }}
                  title={f.feature.title}
                >
                  {f.feature.slug ?? f.feature.title}
                  {f.phaseName && <span> · {f.phaseName}</span>}
                  <span aria-hidden> ↩</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
