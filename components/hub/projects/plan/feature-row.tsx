/**
 * A feature row in the Plan view (f-plan-view t-2; feature-page link + indicative
 * rendering added f-feature-planning §18 t-3).
 *
 * `number | title (+ help-wanted, indicative chip, description, dependency +
 * waiting-on chips) | owner | status + progress | chevron`. The leading number is
 * the feature's **stable** project-wide `§N` (not its row position — the list
 * sorts by `planOrder`). Two affordances, per the owner's
 * three-tier UI: the **slug/title links to the feature page** (the deep,
 * shareable view), and the **chevron toggles** an inset — the glance. A *planned*
 * feature expands to its real task table; an *indicative* feature expands to its
 * high-level sketch (muted, no status pills — these aren't claimable tasks yet).
 * Shipped features recede at reduced opacity (§13.5). Nullable owner renders
 * "unassigned" — never a deref (carried f-data-model t-3 finding).
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { WaitingOnChips } from '@/components/hub/projects/plan/waiting-on-chips';
import { TaskRow, TASK_ROW_GRID } from '@/components/hub/projects/plan/task-row';
import { featureStatus, firstName } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ClaimFeatureButton } from '@/components/hub/projects/feature-view/claim-feature-button';
import { PhasePicker } from '@/components/hub/projects/plan/phase-picker';
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

/** Quiet chip marking a feature whose tasks aren't defined yet (§18 depth axis). */
function IndicativeChip() {
  return (
    <span
      className="inline-flex items-center rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
      style={{ borderColor: 'var(--line)', color: 'var(--ink-faint)' }}
      title="High-level sketch — tasks not planned yet"
    >
      indicative
    </span>
  );
}

export function FeatureRow({
  feature,
  projectId,
  projectRef,
  ordinal,
  expanded,
  onToggle,
  phases = [],
  currentPhaseId = null,
}: {
  feature: PlanFeature;
  /** Canonical cuid — for API calls (the claim button). */
  projectId: string;
  /** Shareable slug (or cuid) — for the feature-page link URL (§19). */
  projectRef: string;
  ordinal: number;
  expanded: boolean;
  onToggle: () => void;
  /** The project's phases, for the assign picker; empty → no picker (f-phases §22 t3). */
  phases?: { id: string; name: string }[];
  /** The band this row is in — its current phase (null = residual "No phase"). */
  currentPhaseId?: string | null;
}) {
  const hasTasks = feature.tasks.length > 0;
  const isIndicative = feature.planningStage === 'indicative';
  const hasSketch = isIndicative && feature.indicativeTasks.length > 0;
  const expandable = hasTasks || hasSketch;
  const status = featureStatus(feature.status);
  const { merged, total, live, blocked, openBugs, unstartedSinceShip } = feature.progress;
  const pct = total > 0 ? Math.round((merged / total) * 100) : 0;
  // The shareable feature page — human project slug + feature slug when authored.
  const featurePath = `/projects/${projectRef}/features/${feature.slug ?? feature.id}`;

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

  const headGrid =
    'grid w-full grid-cols-[2.5rem_1fr_auto_auto_1.5rem] items-start gap-3 p-4 text-left';

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor, opacity: feature.status === 'shipped' ? 0.78 : 1 }}
    >
      <div className={headGrid}>
        <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink-faint)' }}>
          {String(ordinal).padStart(2, '0')}
        </span>

        <span className="block">
          {/* The slug/title is the link to the feature page (the deep view). */}
          <Link
            href={featurePath}
            className="group inline-flex flex-wrap items-baseline gap-2 rounded focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
          >
            {feature.slug && (
              <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
                {feature.slug}
              </span>
            )}
            <span className="text-[15px] font-medium group-hover:underline">{feature.title}</span>
            {feature.helpWanted && <HelpWantedPill />}
            {isIndicative && <IndicativeChip />}
          </Link>
          {/* Plain one-line summary in the row; falls back to the (plain-rendered)
              description until a summary is authored (§21 t-d). */}
          {(feature.summary ?? feature.description) && (
            <span className="mt-1 block text-[13px]" style={{ color: 'var(--ink-mute)' }}>
              {feature.summary ?? feature.description}
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
          {/* Why this feature is blocked — the unshipped deps it's waiting on
              (readiness-derived, f-status-model §20 t-37). */}
          {feature.status === 'blocked' && (
            <WaitingOnChips waitingOn={feature.waitingOn} className="mt-1.5" />
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
            <span className="flex items-center gap-2">
              <span className="text-xs italic" style={{ color: 'var(--ink-faint)' }}>
                unassigned
              </span>
              {/* Pick it up right here — unowned + unshipped is claimable. */}
              {feature.status !== 'shipped' && (
                <ClaimFeatureButton projectId={projectId} featureId={feature.id} variant="inline" />
              )}
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
                {blocked > 0 && (
                  <span style={{ color: 'var(--signal-blocked)' }}> · {blocked} blocked</span>
                )}
                {openBugs > 0 && (
                  <span style={{ color: 'var(--signal-blocked)' }}>
                    {' '}
                    · {openBugs} open {openBugs === 1 ? 'bug' : 'bugs'}
                  </span>
                )}
                {/* Post-ship work NO OTHER MARKER IS SHOWING (§32 t-94) — the unstarted
                    subset, not every open post-ship task. `live`/`blocked` already
                    carry the started ones, and a shipped feature's ratio has no
                    remainder for them to be a breakdown *of*, so "4/4 · 1 live · 1 new"
                    reads as two outstanding items where there is one. (Pre-ship the
                    same overlap is fine: "3/5 · 1 live" reads as "one of the two
                    remaining is being worked".) The gap this closes was always the
                    unstarted case — started post-ship work was never invisible — and
                    since t-89 births an enhancement unassigned, unstarted is normal.

                    NOT `--ink-mute`: that is what the enclosing span already sets, so
                    it rendered identically to the ratio — a marker indistinguishable
                    from the number it qualifies. Every sibling marker carries its own
                    signal token; this one now does too. Quiet without being invisible:
                    slate-blue is a different family from the bug's brick, not a
                    louder shade of it.

                    `--signal-claimed` because the typical post-ship task IS `claimed`
                    — t-89 births an enhancement unassigned and it stays that way until
                    someone pulls it — so the marker matches the pill on its row below
                    in the common case. It does not once the task is started or
                    blocked; the tone tracks the usual state, not every state. */}
                {unstartedSinceShip > 0 && (
                  <span style={{ color: 'var(--signal-claimed)' }}>
                    {' '}
                    · {unstartedSinceShip} new
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>
              {hasSketch
                ? `${feature.indicativeTasks.length} in sketch`
                : feature.status === 'available' || feature.status === 'blocked'
                  ? 'no tasks yet'
                  : '—'}
            </span>
          )}
          {phases.length > 0 && (
            <PhasePicker
              projectId={projectId}
              featureId={feature.id}
              currentPhaseId={currentPhaseId}
              phases={phases}
            />
          )}
        </span>

        <span className="flex justify-end pt-0.5">
          {expandable && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={`feature-tasks-${feature.id}`}
              aria-label={`Toggle ${hasTasks ? 'tasks' : 'sketch'} for ${feature.title}`}
              className="hover:bg-muted/60 -m-1 rounded p-1 transition-colors"
            >
              <ChevronRight
                aria-hidden
                className="h-4 w-4 transition-transform"
                style={{
                  transform: expanded ? 'rotate(90deg)' : 'none',
                  color: 'var(--ink-mute)',
                }}
              />
            </button>
          )}
        </span>
      </div>

      {expanded && hasTasks && (
        <div id={`feature-tasks-${feature.id}`} style={{ backgroundColor: 'var(--bg-sunken)' }}>
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

      {expanded && !hasTasks && hasSketch && (
        <ul
          id={`feature-tasks-${feature.id}`}
          className="space-y-1 px-4 py-3 pl-11"
          style={{ backgroundColor: 'var(--bg-sunken)' }}
        >
          {/* The indicative sketch — muted, no status pills; these aren't
              claimable tasks until the feature is planned. */}
          {feature.indicativeTasks.map((t) => (
            <li
              key={t.id}
              className="flex items-baseline gap-2 text-[13px]"
              style={{ color: 'var(--ink-mute)' }}
            >
              <span aria-hidden style={{ color: 'var(--ink-faint)' }}>
                –
              </span>
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
