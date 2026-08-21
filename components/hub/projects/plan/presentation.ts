/**
 * Presentation helpers for the Plan view (f-plan-view t-2).
 *
 * Maps feature/task status → a **signal tone** (the `--signal-*` consumer tokens,
 * §13.5's quiet status language) + a human label. Kept here so the pill, summary,
 * and rows can't drift. Tones are applied via inline `var(--signal-<tone>)` (a
 * dynamic token name can't be a static Tailwind class).
 */
import { utcShortDate } from '@/components/hub/projects/presentation';
import type {
  FeatureStatus,
  TaskEffectiveStatus,
  PhaseStatus,
} from '@/components/hub/projects/plan/types';

/** A resolved status presentation: the signal token base name + its label. */
export interface StatusTone {
  tone: string;
  label: string;
}

const FEATURE_TONE: Record<FeatureStatus, StatusTone> = {
  shipped: { tone: 'merged', label: 'shipped' },
  in_flight: { tone: 'pr', label: 'in flight' },
  available: { tone: 'available', label: 'available' },
  blocked: { tone: 'blocked', label: 'blocked' },
};

const TASK_TONE: Record<TaskEffectiveStatus, StatusTone> = {
  // "assigned", not "claimed": a born-claimed task is *assigned* (to the feature
  // owner by default) and awaiting a start — the person never actively claimed it
  // (f-task-assignment t1). The stored enum stays `claimed`; only the label changes.
  claimed: { tone: 'claimed', label: 'assigned' },
  active: { tone: 'active', label: 'active' },
  merged: { tone: 'merged', label: 'merged' },
  blocked: { tone: 'blocked', label: 'blocked' },
  // Reachable on the task sheet only (§21 t-123). Every LIST surface drops withdrawn
  // work in its query, but `getTaskDetail` deliberately does not — you cannot restore
  // a task you can no longer open — so a `?task=` link to one still renders. Without
  // an entry here `TASK_TONE[status]` was `undefined` and the pill rendered with no
  // tone and no label.
  withdrawn: { tone: 'withdrawn', label: 'withdrawn' },
};

export function featureStatus(status: FeatureStatus): StatusTone {
  return FEATURE_TONE[status];
}

/**
 * A task's chip tone + label. `hasHolder` is the §32 t-89 amendment: "assigned"
 * assumed every `claimed` task had somebody on it, which was true while the create
 * cascade guaranteed a holder. An `enhancement` is now born with none, and any task
 * can be released — so an unheld task labelled "assigned" sat next to a picker
 * reading "Unassigned", each contradicting the other.
 *
 * Only the *label* changes: the stage is the same, so the tone stays `claimed`.
 * Defaults to held, so every caller that genuinely has an assignee reads as before.
 */
export function taskStatus(status: TaskEffectiveStatus, hasHolder = true): StatusTone {
  if (status === 'claimed' && !hasHolder) {
    return { tone: 'claimed', label: 'unassigned' };
  }
  return TASK_TONE[status];
}

// Phase bands borrow the same signal tones (f-phases §22 t2). `parked` is the
// dormant idea-park — deliberately no signal tone, so the band header renders it
// as quiet muted text (see `phaseStatus` returning `null`).
const PHASE_TONE: Record<Exclude<PhaseStatus, 'parked'>, StatusTone> = {
  upcoming: { tone: 'available', label: 'upcoming' },
  active: { tone: 'active', label: 'active' },
  complete: { tone: 'merged', label: 'complete' },
};

/** A phase's band-header tone, or `null` for `parked` (rendered muted, no dot). */
export function phaseStatus(status: PhaseStatus): StatusTone | null {
  return status === 'parked' ? null : PHASE_TONE[status];
}

/** First name only — compact labels beside small avatars. */
export function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

/** Short label for a PR link: the trailing path segment, `#`-prefixed if numeric. */
export function prLabel(url: string): string {
  const seg = url.split('/').filter(Boolean).pop() ?? url;
  return /^\d+$/.test(seg) ? `#${seg}` : seg;
}

/**
 * A phase lifecycle date for the band header.
 *
 * Delegates to the shared `utcShortDate` — locale-free and UTC, so it survives
 * SSR without a hydration mismatch and cannot shift a UTC-stamped date to the
 * previous day for a viewer west of Greenwich. See that function for why
 * `toLocaleDateString` is the wrong tool here; `ideas/idea-row.tsx` had already
 * reached the same conclusion before this task re-derived it the hard way.
 *
 * Deliberately absolute, not relative: `timeAgo` suits the Log, where an event
 * is a moment you are catching up on, but a phase's start and finish are
 * milestones you compare — "1 Aug 2026 → 18 Aug 2026" reads as a span in a way
 * "2w · 3d" does not.
 */
export function shortDate(iso: string): string {
  return utcShortDate(iso);
}
