'use client';

/**
 * A task borrowed into a phase band (f-work-kinds §32 t-95).
 *
 * `Task.phaseId` records *the phase that chose to do this work* when that isn't its
 * feature's phase — a commitment t-80 shipped with the model, the migration and the
 * MCP verbs, and no read surface at all. This is that read surface: the task shows
 * up under the phase that took it on, while still sitting in its origin feature's
 * task table, unmoved.
 *
 * **A borrowed row is deliberately not a feature row.** It is narrower, indented,
 * and carries an origin breadcrumb (`f-status-model · Foundations (V1) ↩`, the
 * active-fixes strip's pattern) so it reads as "work from elsewhere, being done
 * here" rather than as a feature of this phase. What it must *not* do is announce
 * that through **placement** — it sits inline, in readiness order, because a
 * borrowed task can be the thing blocking a feature new to the phase, and a
 * trailing sub-band would sort it below what it blocks.
 *
 * Clicking opens the same deep-linkable task sheet as any other task row.
 */
import Link from 'next/link';
import { CornerDownLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { sanitizeUrl } from '@/lib/security/sanitize';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { taskStatus, firstName, prLabel } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import { KindTag } from '@/components/hub/projects/kind-tag';
import type { PlanBorrowedTask } from '@/components/hub/projects/plan/types';

export function BorrowedTaskRow({
  task,
  projectRef,
}: {
  task: PlanBorrowedTask;
  projectRef: string;
}) {
  const { open } = useTaskSheet();
  const status = taskStatus(task.status, task.claimer != null);
  const prUrl = task.prUrl ? sanitizeUrl(task.prUrl) : '';
  const featureRef = task.feature.slug ?? task.feature.title;
  const featurePath = `/projects/${projectRef}/features/${task.feature.slug ?? task.feature.id}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(task.id)}
      onKeyDown={(e) => {
        // Only when the ROW itself has focus. Without the target check this
        // `preventDefault` swallows Enter on the links *inside* the row — tab to the
        // origin breadcrumb, press Enter, and navigation is cancelled while the sheet
        // opens instead. The mouse path is guarded by `stopPropagation` on each link;
        // keyboard needs this, or the row's whole reason to exist is unreachable
        // without a pointer.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(task.id);
        }
      }}
      // Names the origin too: `aria-label` overrides the row's contents, so without
      // it the breadcrumb — the one thing distinguishing a borrowed row — is never
      // announced.
      aria-label={`Open task ${task.number != null ? `t-${task.number}` : task.title}, borrowed from ${featureRef}`}
      className="focus-visible:ring-ring ml-6 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-2.5 text-[13px] transition-colors hover:bg-[var(--bg-tint)] focus-visible:ring-2 focus-visible:outline-none"
      style={{ borderColor: 'var(--line-soft)' }}
    >
      <span className="w-10 shrink-0 font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
        t-{task.number ?? '—'}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5" style={{ color: 'var(--ink-soft)' }}>
          <KindTag kind={task.kind} />
          <span className="truncate">{task.title}</span>
        </span>
        {/* Origin breadcrumb — where this work actually lives. Stops propagation so
            the feature link doesn't also open the task sheet behind it. */}
        <span
          className="flex min-w-0 items-center gap-1 font-mono text-[10.5px]"
          style={{ color: 'var(--ink-faint)' }}
        >
          <CornerDownLeft className="h-3 w-3 shrink-0" aria-hidden />
          {/* `next/link`, matching FeatureRow — a raw <a> would full-page-load and
              discard the Plan's band/feature expand state and the task-sheet context. */}
          <Link
            href={featurePath}
            onClick={(e) => e.stopPropagation()}
            className="truncate underline-offset-2 hover:underline"
          >
            {featureRef}
          </Link>
          {task.originPhaseName && <span className="truncate">· {task.originPhaseName}</span>}
        </span>
      </span>

      {task.claimer ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <Avatar className="h-5 w-5">
            {task.claimer.image && <AvatarImage src={task.claimer.image} alt="" />}
            <AvatarFallback className="text-[9px]">{initials(task.claimer.name)}</AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground text-xs">{firstName(task.claimer.name)}</span>
        </span>
      ) : (
        <span className="shrink-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
          unassigned
        </span>
      )}

      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 font-mono text-xs underline-offset-2 hover:underline"
          style={{ color: 'var(--ink-mute)' }}
        >
          {prLabel(prUrl)}
        </a>
      )}

      <span className="shrink-0">
        <StatusPill tone={status.tone} label={status.label} />
      </span>
    </div>
  );
}
