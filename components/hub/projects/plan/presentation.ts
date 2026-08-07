/**
 * Presentation helpers for the Plan view (f-plan-view t-2).
 *
 * Maps feature/task status → a **signal tone** (the `--signal-*` consumer tokens,
 * §13.5's quiet status language) + a human label. Kept here so the pill, summary,
 * and rows can't drift. Tones are applied via inline `var(--signal-<tone>)` (a
 * dynamic token name can't be a static Tailwind class).
 */
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
  claimed: { tone: 'claimed', label: 'claimed' },
  active: { tone: 'active', label: 'active' },
  merged: { tone: 'merged', label: 'merged' },
  blocked: { tone: 'blocked', label: 'blocked' },
};

export function featureStatus(status: FeatureStatus): StatusTone {
  return FEATURE_TONE[status];
}

export function taskStatus(status: TaskEffectiveStatus): StatusTone {
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
