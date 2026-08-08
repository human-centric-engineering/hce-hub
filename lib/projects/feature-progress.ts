/**
 * Kind-aware feature-completion progress (f-bug-handling §22-02).
 *
 * `bug`-kind tasks are EXCLUDED from a feature's completion counts
 * (`merged`/`total`/`live`/`blocked`) and surfaced separately as `openFixes`.
 * The reason: a feature's `shipped` status is authoritative (`ship_feature` sets
 * it; nothing recomputes it from tasks), so an open bug can't un-ship a feature —
 * but its *progress* would otherwise read "3/4 merged" and look unfinished. Bugs
 * are a second axis (fixes pulled from any phase), not part of the build-out, so
 * they get counted as open fixes, never against completion. Feature-work is every
 * task that isn't a bug. Pure + total (planning-retro B12): reads a task's
 * effective status + kind, no DB.
 */
import type { TaskKind } from '@prisma/client';
import type { EffectiveStatus } from '@/lib/projects/task-status';

/** A feature's completion progress + its open-fixes count. */
export interface FeatureProgress {
  merged: number;
  total: number;
  /** Feature-work tasks actively being worked (effective `active`). */
  live: number;
  /** Feature-work tasks claimed but waiting on an unmerged dependency. */
  blocked: number;
  /** Open (unmerged) `bug`-kind tasks — the "· N open fixes" surface. */
  openFixes: number;
}

/** The minimal task shape progress reads: effective status + kind. */
export interface ProgressTaskInput {
  status: EffectiveStatus;
  kind: TaskKind;
}

/**
 * Compute kind-aware progress: completion counts over feature-work only, with
 * open bugs tallied separately as `openFixes`.
 */
export function computeFeatureProgress(tasks: readonly ProgressTaskInput[]): FeatureProgress {
  const work = tasks.filter((t) => t.kind !== 'bug');
  return {
    total: work.length,
    merged: work.filter((t) => t.status === 'merged').length,
    live: work.filter((t) => t.status === 'active').length,
    blocked: work.filter((t) => t.status === 'blocked').length,
    openFixes: tasks.filter((t) => t.kind === 'bug' && t.status !== 'merged').length,
  };
}
