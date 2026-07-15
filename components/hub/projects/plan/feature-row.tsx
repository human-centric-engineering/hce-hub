/**
 * A feature row in the Plan view (f-plan-view t-2).
 *
 * `ordinal | title (+ help-wanted, description, dependency chips) | owner |
 * status + progress | chevron`. When the feature has tasks the whole head is a
 * toggle button that expands an inset task table; shipped features recede at
 * reduced opacity (§13.5). The head uses only `<span>`s so it's valid inside the
 * `<button>`. Nullable owner renders "unassigned" — never a deref (carried
 * f-data-model t-3 finding).
 */
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { TaskRow, TASK_ROW_GRID } from '@/components/hub/projects/plan/task-row';
import { featureStatus, firstName } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import type { PlanFeature } from '@/components/hub/projects/plan/types';

/** Small clay pill flagging a feature that wants help (§5, §13.5). */
function HelpWantedPill() {
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent-ink)' }}
    >
      help wanted
    </span>
  );
}

export function FeatureRow({
  feature,
  ordinal,
  expanded,
  onToggle,
}: {
  feature: PlanFeature;
  ordinal: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasTasks = feature.tasks.length > 0;
  const status = featureStatus(feature.status);
  const { merged, total, live } = feature.progress;
  const pct = total > 0 ? Math.round((merged / total) * 100) : 0;

  const borderColor =
    feature.status === 'blocked'
      ? 'var(--signal-blocked)'
      : feature.status === 'shipped'
        ? 'var(--line-soft)'
        : 'var(--line)';
  const fillColor =
    feature.status === 'blocked'
      ? 'var(--signal-blocked)'
      : feature.status === 'shipped'
        ? 'var(--signal-merged)'
        : 'var(--ink-soft)';

  const head = (
    <>
      <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink-faint)' }}>
        {String(ordinal).padStart(2, '0')}
      </span>

      <span className="block">
        <span className="flex flex-wrap items-baseline gap-2">
          {feature.slug && (
            <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
              {feature.slug}
            </span>
          )}
          <span className="text-[15px] font-medium">{feature.title}</span>
          {feature.helpWanted && <HelpWantedPill />}
        </span>
        {feature.description && (
          <span className="mt-1 block text-[13px]" style={{ color: 'var(--ink-mute)' }}>
            {feature.description}
          </span>
        )}
        {feature.dependsOn.length > 0 && (
          <span
            className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"
            style={{ color: 'var(--ink-faint)' }}
          >
            <span>depends on</span>
            {feature.dependsOn.map((d) => (
              <span
                key={d.id}
                className="rounded border px-1.5 py-0.5 font-mono"
                style={{ borderColor: 'var(--line)', color: 'var(--ink-mute)' }}
                title={d.title}
              >
                {d.slug ?? d.title}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {feature.owner ? (
          <>
            <Avatar className="h-6 w-6">
              {feature.owner.image && <AvatarImage src={feature.owner.image} alt="" />}
              <AvatarFallback className="text-[10px]">
                {initials(feature.owner.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground text-xs">{firstName(feature.owner.name)}</span>
          </>
        ) : (
          <span className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>
            unassigned
          </span>
        )}
      </span>

      <span className="flex flex-col items-end gap-1">
        <StatusPill tone={status.tone} label={status.label} />
        {hasTasks ? (
          <span className="flex flex-col items-end gap-1">
            <span
              className="block h-[3px] w-24 overflow-hidden rounded-full"
              style={{ backgroundColor: 'var(--line)' }}
            >
              <span
                className="block h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: fillColor }}
              />
            </span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--ink-mute)' }}>
              {merged}/{total}
              {live > 0 && <span style={{ color: 'var(--signal-pr)' }}> · {live} live</span>}
            </span>
          </span>
        ) : (
          <span className="font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>
            {feature.status === 'planning' ? 'no tasks yet' : '—'}
          </span>
        )}
      </span>

      <span className="flex justify-end pt-0.5">
        {hasTasks && (
          <ChevronRight
            aria-hidden
            className="h-4 w-4 transition-transform"
            style={{ transform: expanded ? 'rotate(90deg)' : 'none', color: 'var(--ink-mute)' }}
          />
        )}
      </span>
    </>
  );

  const headGrid =
    'grid w-full grid-cols-[2.5rem_1fr_auto_auto_1.5rem] items-start gap-3 p-4 text-left';

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor, opacity: feature.status === 'shipped' ? 0.78 : 1 }}
    >
      {hasTasks ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={cn(headGrid, 'hover:bg-muted/40 transition-colors')}
        >
          {head}
        </button>
      ) : (
        <div className={headGrid}>{head}</div>
      )}

      {expanded && hasTasks && (
        <div style={{ backgroundColor: 'var(--bg-sunken)' }}>
          <div
            className={`${TASK_ROW_GRID} px-4 py-1.5 pl-7 text-[9.5px] tracking-wider uppercase`}
            style={{ color: 'var(--ink-faint)' }}
          >
            <span className="font-mono">id</span>
            <span className="font-mono">task</span>
            <span className="font-mono">claimed by</span>
            <span className="font-mono">pr</span>
            <span className="font-mono">status</span>
          </div>
          {feature.tasks.map((t, i) => (
            <TaskRow key={t.id} task={t} ordinal={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
