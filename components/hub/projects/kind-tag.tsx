import { Bug, Plus, type LucideIcon } from 'lucide-react';
import type { TaskKind } from '@/components/hub/projects/plan/types';

/** How one task kind reads: its glyph, its word, and the hue both registers give it. */
export interface TaskKindCue {
  Icon: LucideIcon;
  label: string;
  /** The `title` tooltip — the one place the kind gets to explain itself. */
  title: string;
  /** A theme token, not a literal — the two registers differ in weight, never in hue. */
  color: string;
}

/**
 * The task-kind vocabulary (f-bug-handling §22-02; `enhancement` added by
 * f-work-kinds §32 t-88) — one place for the word, glyph and hue each kind is read
 * by, so the two registers that render it can't drift apart in wording while
 * differing, deliberately, in weight: `KindTag` below for the row/tag surfaces, and
 * the Board card's own marker family (`board/task-card.tsx`), which sits alongside
 * the Blocked and Collision marks in a visual context of its own.
 *
 * A **total** `Record<TaskKind, …>` rather than a lookup with a fallback, because
 * the gap it closes was exactly a missing case: t-79 added `enhancement` to the
 * enum, every render site tested `kind === 'bug'`, and a post-ship enhancement
 * showed up untagged — indistinguishable from feature-work. A total map turns the
 * next kind added to the union into a compile error here rather than a silence on
 * screen.
 *
 * `feature_work` maps to `null` on purpose: it is the unmarked default and the bulk
 * of every board, so tagging it would be noise rather than information. Only work
 * that is *not* the ordinary case earns a mark.
 *
 * Both cues stay in the same quiet register — a fix, not a crisis (anti-urgency:
 * no red, no pulse, no badge count). An enhancement sits a step below a bug, on
 * `--ink-mute` rather than the bug's brick, because an improvement to shipped work
 * is a classification, not a signal.
 */
export const TASK_KIND_CUE: Record<TaskKind, TaskKindCue | null> = {
  feature_work: null,
  bug: {
    Icon: Bug,
    label: 'bug',
    title: 'A bug — a fix on the feature it broke',
    color: 'var(--signal-blocked)',
  },
  enhancement: {
    Icon: Plus,
    label: 'enhancement',
    title: 'An enhancement — an improvement to a feature that already shipped',
    color: 'var(--ink-mute)',
  },
};

/**
 * The kind cue for the row/tag surfaces — the Plan row, the feature page's task
 * rows, and the task sheet header. Renders nothing for the unmarked default, so
 * call sites pass the kind unconditionally and never re-test it.
 */
export function KindTag({ kind }: { kind: TaskKind }) {
  const cue = TASK_KIND_CUE[kind];
  if (!cue) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
      style={{ color: cue.color, backgroundColor: 'var(--bg-tint)' }}
      title={cue.title}
    >
      <cue.Icon className="h-3 w-3" aria-hidden />
      {cue.label}
    </span>
  );
}
