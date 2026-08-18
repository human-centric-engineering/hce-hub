'use client';

/**
 * The feature page's task surface (f-feature-planning §18 t-3).
 *
 * A *planned* feature shows its real `Task` rows — number · title (+ done-when) ·
 * assignee/claimer · effective-status pill — each opening the deep-linkable
 * `?task=` sheet in place (the same overlay the Plan/Board use, mounted by the
 * page's `TaskSheetProvider`). An *indicative* feature shows its high-level
 * sketch (muted, no pills — not claimable yet). Reuses the Plan's status
 * presentation so the surfaces can't drift.
 *
 * A feature that changed phase mid-flight also gets a **boundary marker** between
 * the work completed under each phase (§33 t-100) — otherwise a re-homed feature
 * reads as though all of it happened under the phase it sits in today, which is
 * the history-rewriting f-phase-history exists to stop. A feature that never
 * moved gets an empty boundary list and renders exactly as it did before.
 */
import { Fragment } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { taskStatus, firstName } from '@/components/hub/projects/plan/presentation';
import { initials, utcShortDate } from '@/components/hub/projects/presentation';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import { KindTag } from '@/components/hub/projects/kind-tag';
import type {
  FeatureDetailTaskDTO,
  FeatureDetailIndicativeTaskDTO,
  FeatureTaskPhaseBoundaryDTO,
} from '@/components/hub/projects/feature-view/types';

/**
 * The rule between two bands of work: everything above was completed under
 * `from`, everything below under `to`.
 *
 * Deliberately **not** a link to either phase. The names are snapshots of what
 * the phases were called at the time; linking them would send you to whatever
 * that phase says today, quietly undoing the point of snapshotting them.
 */
function PhaseBoundary({ boundary }: { boundary: FeatureTaskPhaseBoundaryDTO }) {
  const from = boundary.fromPhaseName ?? 'no phase';
  const to = boundary.toPhaseName ?? 'no phase';
  const label = `moved from ${from} to ${to} on ${utcShortDate(boundary.movedAt)}`;

  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 py-1.5">
      <span aria-hidden className="h-px flex-1" style={{ backgroundColor: 'var(--line-soft)' }} />
      <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        moved from {from} to {to} · {utcShortDate(boundary.movedAt)}
      </span>
      <span aria-hidden className="h-px flex-1" style={{ backgroundColor: 'var(--line-soft)' }} />
    </div>
  );
}

function TaskItem({ task }: { task: FeatureDetailTaskDTO }) {
  const { open } = useTaskSheet();
  // Assignee is the softer "this is yours"; the live claimer takes precedence.
  const person = task.claimer ?? task.assignee;
  const status = taskStatus(task.status, person != null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(task.id);
        }
      }}
      aria-label={`Open task ${task.number != null ? `t-${task.number}` : task.title}`}
      className="focus-visible:ring-ring flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-[var(--bg-tint)] focus-visible:ring-2 focus-visible:outline-none"
      style={{ borderColor: 'var(--line-soft)' }}
    >
      <span className="w-10 shrink-0 font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
        t-{task.number ?? '—'}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="flex items-center gap-1.5 text-[14px]"
          style={{ color: 'var(--ink-soft)' }}
        >
          <KindTag kind={task.kind} />
          <span className="truncate">{task.title}</span>
        </span>
        {task.doneWhen && (
          <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--ink-faint)' }}>
            done when: {task.doneWhen}
          </span>
        )}
      </span>

      {person ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <Avatar className="h-5 w-5">
            {person.image && <AvatarImage src={person.image} alt="" />}
            <AvatarFallback className="text-[9px]">{initials(person.name)}</AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground text-xs">{firstName(person.name)}</span>
        </span>
      ) : (
        <span className="shrink-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
          unassigned
        </span>
      )}

      <span className="shrink-0">
        <StatusPill tone={status.tone} label={status.label} />
      </span>
    </div>
  );
}

export function FeatureTaskList({
  tasks,
  indicativeTasks,
  phaseBoundaries,
}: {
  tasks: FeatureDetailTaskDTO[];
  indicativeTasks: FeatureDetailIndicativeTaskDTO[];
  /**
   * Empty unless the feature changed phase mid-flight (§33 t-100). **Required,
   * not optional** — three hand-mirror gaps on this feature all took the same
   * shape (data on the wire that a type let the caller quietly drop), and a
   * defaulted prop is the component-level version of the same hole.
   */
  phaseBoundaries: FeatureTaskPhaseBoundaryDTO[];
}) {
  if (tasks.length > 0) {
    // Several moves can share an anchor (two moves with no completed work
    // between them), so this is a list per task, not one marker per task. The
    // React key is the position in the server-ordered list, not the move's
    // timestamp + destination — two moves CAN share both of those.
    type Keyed = { boundary: FeatureTaskPhaseBoundaryDTO; key: number };
    const above = new Map<string, Keyed[]>();
    const trailing: Keyed[] = [];
    phaseBoundaries.forEach((boundary, key) => {
      const entry = { boundary, key };
      if (boundary.beforeTaskId === null) trailing.push(entry);
      else above.set(boundary.beforeTaskId, [...(above.get(boundary.beforeTaskId) ?? []), entry]);
    });

    return (
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <Fragment key={t.id}>
            {(above.get(t.id) ?? []).map((b) => (
              <PhaseBoundary key={b.key} boundary={b.boundary} />
            ))}
            <TaskItem task={t} />
          </Fragment>
        ))}
        {trailing.map((b) => (
          <PhaseBoundary key={b.key} boundary={b.boundary} />
        ))}
      </div>
    );
  }

  if (indicativeTasks.length > 0) {
    return (
      <ul className="flex flex-col gap-1.5">
        {indicativeTasks.map((t) => (
          <li
            key={t.id}
            className="flex items-baseline gap-2 text-[14px]"
            style={{ color: 'var(--ink-mute)' }}
          >
            <span aria-hidden style={{ color: 'var(--ink-faint)' }}>
              –
            </span>
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
      No tasks yet — this feature hasn&rsquo;t been planned.
    </p>
  );
}
