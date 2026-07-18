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
 */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { taskStatus, firstName } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type {
  FeatureDetailTaskDTO,
  FeatureDetailIndicativeTaskDTO,
} from '@/components/hub/projects/feature-view/types';

function TaskItem({ task }: { task: FeatureDetailTaskDTO }) {
  const { open } = useTaskSheet();
  const status = taskStatus(task.status);
  // Assignee is the softer "this is yours"; the live claimer takes precedence.
  const person = task.claimer ?? task.assignee;

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
        <span className="block truncate text-[14px]" style={{ color: 'var(--ink-soft)' }}>
          {task.title}
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
}: {
  tasks: FeatureDetailTaskDTO[];
  indicativeTasks: FeatureDetailIndicativeTaskDTO[];
}) {
  if (tasks.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} />
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
