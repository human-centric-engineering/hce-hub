'use client';

/**
 * The active-bugs strip (f-bug-handling §22-02 t2).
 *
 * A pinned, project-scoped band above the Plan/Board body listing every open
 * `bug`-kind task in the project, each with a breadcrumb to the feature (and
 * phase) it lives on. It sits above the phase-grouped body precisely to signal a
 * *different axis* — bugs pulled from any phase — and being project-scoped it
 * survives the no-active-phase case. It is a **reference** band: it points at the
 * bug and opens it; it never pulls the origin feature forward.
 *
 * Self-hiding: renders nothing when there are no open bugs (empty → gone). The
 * header toggles the list collapsed (persisted) so a long list can be tucked away
 * while you work features first — the count stays visible either way.
 */
import { Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { ActiveBugDTO } from '@/components/hub/projects/types';

export function ActiveBugsStrip({ bugs, projectId }: { bugs: ActiveBugDTO[]; projectId: string }) {
  const { open } = useTaskSheet();
  // Project-keyed so the collapse choice is per-project (the strip is
  // project-scoped everywhere else); collapsing project A doesn't collapse B.
  //
  // **Renamed from `hub:active-fixes-collapsed:` with no migration** (t-110), and
  // that is the decision, not an oversight (`/code-review` raised it). Anyone who
  // had collapsed the strip sees it expanded once more, and the old key is
  // orphaned in their browser. Both are cheaper than a read-the-old-key fallback,
  // which would be permanent code carrying a removal trigger nobody will ever
  // pull, to preserve one boolean UI preference on an internal tool. The value is
  // re-set the next time anyone collapses it.
  const [collapsed, setCollapsed] = useLocalStorage(
    `hub:active-bugs-collapsed:${projectId}`,
    false
  );
  if (bugs.length === 0) return null;

  return (
    // `mt-8` (not a wrapper div in the parent) so the spacing lives with the
    // null-guarded element — no empty gap when there are no bugs.
    <section
      aria-label="Active bugs"
      className="mt-8 rounded-lg border px-4 py-3"
      style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-tint)' }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show active bugs' : 'Hide active bugs'}
        className={`flex w-full items-center gap-2 ${collapsed ? '' : 'mb-2'}`}
      >
        {/* A wrench, not a red alarm — a bug is work to pull, not a crisis (anti-urgency,
            §25). Re-confirmed when the label became "Active bugs" (t-110) rather than assumed:
            the argument was never about the word "fix", it was about not dressing a defect as
            an emergency, and lucide's `Bug` glyph would trade a tool for a pest. Wrench stays. */}
        <Wrench className="h-3.5 w-3.5" style={{ color: 'var(--signal-blocked)' }} aria-hidden />
        <span className="text-[12px] font-medium" style={{ color: 'var(--ink-soft)' }}>
          Active bugs · {bugs.length}
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
          {bugs.map((bug) => (
            <li key={bug.taskId}>
              <button
                type="button"
                onClick={() => open(bug.taskId)}
                className="flex w-full items-baseline justify-between gap-3 rounded px-1.5 py-1 text-left text-[13px] hover:bg-[var(--bg-elev)]"
              >
                <span className="min-w-0 truncate" style={{ color: 'var(--ink-soft)' }}>
                  {bug.taskNumber != null && (
                    <span
                      className="mr-1.5 font-mono text-[11px]"
                      style={{ color: 'var(--ink-faint)' }}
                    >
                      t-{bug.taskNumber}
                    </span>
                  )}
                  {bug.title}
                </span>
                {/* Origin breadcrumb: feature (slug fallback title) · phase, with a ↩
                    to signal "reference back" — the bug lives on that feature/phase. */}
                <span
                  className="shrink-0 font-mono text-[11px]"
                  style={{ color: 'var(--ink-faint)' }}
                  title={bug.feature.title}
                >
                  {bug.feature.slug ?? bug.feature.title}
                  {bug.phaseName && <span> · {bug.phaseName}</span>}
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
