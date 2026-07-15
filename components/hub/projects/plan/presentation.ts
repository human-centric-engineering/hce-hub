/**
 * Presentation helpers for the Plan view (f-plan-view t-2).
 *
 * Maps feature/task status → a **signal tone** (the `--signal-*` consumer tokens,
 * §13.5's quiet status language) + a human label. Kept here so the pill, summary,
 * and rows can't drift. Tones are applied via inline `var(--signal-<tone>)` (a
 * dynamic token name can't be a static Tailwind class).
 */
import type { FeatureStatus, TaskEffectiveStatus } from '@/components/hub/projects/plan/types';

/** A resolved status presentation: the signal token base name + its label. */
export interface StatusTone {
  tone: string;
  label: string;
}

const FEATURE_TONE: Record<FeatureStatus, StatusTone> = {
  shipped: { tone: 'merged', label: 'shipped' },
  in_flight: { tone: 'pr', label: 'in flight' },
  planning: { tone: 'backlog', label: 'planning' },
  blocked: { tone: 'blocked', label: 'blocked' },
};

const TASK_TONE: Record<TaskEffectiveStatus, StatusTone> = {
  merged: { tone: 'merged', label: 'merged' },
  in_pr: { tone: 'pr', label: 'in pr' },
  claimed: { tone: 'claimed', label: 'claimed' },
  available: { tone: 'available', label: 'available' },
  backlog: { tone: 'backlog', label: 'backlog' },
  blocked: { tone: 'blocked', label: 'blocked' },
};

export function featureStatus(status: FeatureStatus): StatusTone {
  return FEATURE_TONE[status];
}

export function taskStatus(status: TaskEffectiveStatus): StatusTone {
  return TASK_TONE[status];
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
