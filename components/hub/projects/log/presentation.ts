/**
 * Presentation helpers for the journal / Log surfaces (f-journal §17 t-3):
 * map an event `kind` (+ metadata) to a human label, group events for the Log
 * filters, and format a compact relative time. Kept pure so both the project Log
 * and the task-sheet timeline render events identically.
 */

import type { ProjectEventDTO, ProjectEventKindDTO } from '@/components/hub/projects/log/types';

/** Guarded narrowing of an event's `unknown` metadata to a readable record. */
function readMeta(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

/**
 * A short verb phrase describing what happened, phrased to read after the
 * actor's name in both the project Log ("Simon created the task") and the
 * task-sheet timeline. Auto-events derive their nuance from metadata
 * (help-wanted set vs cleared). `task_claimed` is reused for Start (a task is
 * *born* claimed, so the notable event is being actively taken — f-status-model §20).
 */
export function describeEvent(event: ProjectEventDTO): string {
  const meta = readMeta(event.metadata);
  switch (event.kind) {
    case 'feature_created':
      return 'created the feature';
    case 'feature_claimed':
      return 'claimed the feature';
    case 'feature_planned':
      return 'planned the feature';
    case 'feature_shipped':
      return 'shipped the feature';
    case 'feature_blocked':
      return 'marked the feature blocked';
    case 'feature_unblocked':
      return 'unblocked the feature';
    case 'task_created':
      return 'created the task';
    case 'task_claimed':
      return 'started the task';
    case 'task_pr_linked':
      return 'linked a PR';
    case 'task_merged':
      return 'completed the task';
    case 'help_wanted':
      return meta.helpWanted === true ? 'flagged help wanted' : 'cleared help wanted';
    case 'member_added':
      return 'joined the project';
    case 'decision':
      return 'recorded a decision';
    case 'note':
      return 'added a note';
    default:
      return 'updated the project';
  }
}

/** The Log filter groups. `all` shows everything; the others narrow by kind. */
export type LogFilter = 'all' | 'decisions' | 'work';

/** The `kinds` query value for a filter (undefined ⇒ no filter, i.e. all). */
export function filterKinds(filter: LogFilter): ProjectEventKindDTO[] | undefined {
  switch (filter) {
    case 'decisions':
      return ['decision'];
    case 'work':
      return ['feature_shipped', 'task_merged'];
    case 'all':
    default:
      return undefined;
  }
}

export const LOG_FILTERS: { key: LogFilter; label: string }[] = [
  { key: 'all', label: 'All activity' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'work', label: 'Work completed' },
];

/**
 * A compact relative time ("just now", "5m", "3h", "2d", else a short date).
 * Deterministic given `now` so it's testable without faking the clock.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
