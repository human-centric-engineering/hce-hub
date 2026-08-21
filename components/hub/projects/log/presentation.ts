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

/** `" X"` when the phase's name was recorded, else `''` — never a bare "undefined". */
function phaseSuffix(name: unknown): string {
  return typeof name === 'string' && name.length > 0 ? ` ${name}` : '';
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
    case 'bug_reported':
      return 'reported a bug';
    case 'task_assigned':
      // One kind, two moves: `assign_task` records a null assignee when a task is
      // released back to the pool (§32 t-89), so read the metadata rather than
      // spending a `ProjectEventKind` (and a migration) on the mirror image. The
      // key must be *present and null* — a metadata-less event is an assignment
      // whose detail we lost, not a release.
      return 'assigneeUserId' in meta && meta.assigneeUserId === null
        ? 'returned the task to the pool'
        : 'assigned the task';
    case 'task_withdrawn':
      // One kind, both directions — `restored` in the metadata, the `task_assigned`
      // precedent above (§21 t-123). The journal is where withdrawn work stays
      // visible after every work surface has dropped it, so this line is often the
      // ONLY remaining trace on screen: it says which way it went, and the reason
      // rides in the event body.
      return meta.restored === true ? 'restored the task' : 'withdrew the task';
    case 'help_wanted':
      return meta.helpWanted === true ? 'flagged help wanted' : 'cleared help wanted';
    case 'member_added':
      return 'joined the project';
    case 'phase_created':
      return `created the phase${phaseSuffix(meta.name)}`;
    case 'phase_updated': {
      // One kind, several moves — the changed fields are in the metadata rather
      // than in three more enum values (the `task_assigned` precedent above).
      // Only a single-field edit gets a specific verb; a combined edit reads as
      // "updated", because naming one of two changes would be misleading.
      // The name is snapshotted on EVERY phase_updated, not just renames — these
      // events carry no feature/task ref, so it is the only thing identifying which
      // phase changed. `phaseSuffix` degrades to '' for events written before that.
      const named = phaseSuffix(meta.name);
      const fields = Array.isArray(meta.fields) ? meta.fields : [];
      if (fields.length === 1) {
        if (fields[0] === 'name') return `renamed the phase${named}`;
        if (fields[0] === 'status') {
          return typeof meta.status === 'string'
            ? `set${named || ' the phase'} to ${meta.status}`
            : `changed the status of${named || ' the phase'}`;
        }
        // Both fields are "the intent" at the Log's granularity — a reader wants
        // to know the phase's stated purpose changed, not which column held it.
        // `summary` is what the manage dialog writes since §33-sweep t-104, so
        // without it every UI intent edit fell through to the generic line below
        // and the specific verb survived only on the `description` path that the
        // UI can no longer reach (`/code-review`).
        if (fields[0] === 'summary' || fields[0] === 'description')
          return `edited the intent of${named || ' the phase'}`;
      }
      return `updated the phase${named}`;
    }
    case 'phase_membership_changed': {
      // The subject rides in metadata for the same reason. Phase NAMES are
      // snapshots taken at write time (see lib/projects/phase-events.ts), so a
      // later rename never rewrites what an old entry says.
      const subject = meta.subject === 'task' ? 'task' : 'feature';
      const to = typeof meta.toPhaseName === 'string' ? meta.toPhaseName : null;
      const from = typeof meta.fromPhaseName === 'string' ? meta.fromPhaseName : null;
      if (to === null) {
        return from !== null
          ? `took the ${subject} out of ${from}`
          : `took the ${subject} out of its phase`;
      }
      if (from === null) return `filed the ${subject} under ${to}`;
      return `moved the ${subject} from ${from} to ${to}`;
    }
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
