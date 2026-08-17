/**
 * A task row in a feature's expanded inset table (f-plan-view t-2).
 *
 * Columns: `t-N` · title · claimed-by · pr · effective status. Clicking the row
 * opens the deep-linkable task sheet (f-task-sheet §11); the PR link stops
 * propagation so it opens the PR, not the sheet. A null claimer renders "—"
 * (effective status already reconciles an erased claimant back to the pool, so a
 * null here means genuinely unclaimed).
 */
import { ArrowRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { sanitizeUrl } from '@/lib/security/sanitize';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { taskStatus, firstName, prLabel } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import { KindTag } from '@/components/hub/projects/kind-tag';
import type { PlanTask } from '@/components/hub/projects/plan/types';

/** Shared grid template — fixed trailing widths so the header and rows align
 * across their separate grid containers. */
export const TASK_ROW_GRID = 'grid grid-cols-[2.5rem_1fr_7rem_4.5rem_6.5rem] items-center gap-3';

export function TaskRow({ task, ordinal }: { task: PlanTask; ordinal: number }) {
  const { open } = useTaskSheet();
  // `claimer` is the resolved *holder* here (lib/projects/plan.ts) — null when
  // nobody holds the task, or when the holder was erased. Either way it is nobody's.
  const status = taskStatus(task.status, task.claimer != null);
  // Sanitize the (human-declared) PR url — a `javascript:`/`data:` scheme yields
  // '' → no link. Safe by construction before the `in_pr` write flow lands.
  const prUrl = task.prUrl ? sanitizeUrl(task.prUrl) : '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(task.id)}
      onKeyDown={(e) => {
        // Only when the ROW itself has focus — otherwise this `preventDefault`
        // swallows Enter on the PR link inside it, cancelling navigation and opening
        // the sheet instead. The click path already guards with `stopPropagation`;
        // keyboard had no equivalent. (Surfaced by t-95's review on the sibling
        // borrowed row, which inherited this shape.)
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(task.id);
        }
      }}
      aria-label={`Open task ${task.number != null ? `t-${task.number}` : task.title}`}
      className={`${TASK_ROW_GRID} focus-visible:ring-ring cursor-pointer border-t px-4 py-2 pl-7 text-[13px] transition-colors hover:bg-[var(--bg-tint)] focus-visible:ring-2 focus-visible:outline-none`}
      style={{ borderColor: 'var(--line-soft)' }}
    >
      <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
        t-{task.number ?? ordinal}
      </span>
      <span className="flex min-w-0 items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
        <KindTag kind={task.kind} />
        <span className="truncate">{task.title}</span>
        {/* The reciprocal of the borrowed row in that phase's band (§32 t-95): this
            task lives here, but another phase committed to doing it. Without it a
            feature owner is blind to work happening on their feature under someone
            else's banner. Per-task rather than a count on the summary line — those
            markers have to stay disjoint (§32 t-94), and "which phase" is the part
            worth knowing. */}
        {task.committedPhaseName && (
          <span
            className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] whitespace-nowrap"
            style={{ color: 'var(--ink-faint)' }}
            title={`Committed to the ${task.committedPhaseName} phase — it also appears in that band`}
          >
            <ArrowRight className="h-3 w-3" aria-hidden />
            {task.committedPhaseName}
          </span>
        )}
      </span>

      {task.claimer ? (
        <span className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5">
            {task.claimer.image && <AvatarImage src={task.claimer.image} alt="" />}
            <AvatarFallback className="text-[9px]">{initials(task.claimer.name)}</AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground truncate text-xs">
            {firstName(task.claimer.name)}
          </span>
        </span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          —
        </span>
      )}

      {prUrl ? (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs underline-offset-2 hover:underline"
          style={{ color: 'var(--ink-mute)' }}
        >
          {prLabel(prUrl)}
        </a>
      ) : (
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          —
        </span>
      )}

      <StatusPill tone={status.tone} label={status.label} />
    </div>
  );
}
