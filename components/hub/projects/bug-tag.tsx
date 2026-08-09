import { Bug } from 'lucide-react';

/**
 * BugTag (f-bug-handling §22-02) — the one quiet **bug** cue for a `bug`-kind task,
 * shared across the row/tag surfaces: the Plan row, the feature page's task rows,
 * and the task sheet header. A fix, not a crisis (anti-urgency): no red, no pulse —
 * a muted glyph + label + tooltip, so a defect reads apart from feature-work without
 * shouting. Callers render it only when `kind === 'bug'`.
 *
 * The Board card uses its own `BugMark` instead (board/task-card.tsx) — there the
 * cue belongs to the card's *marker* family (alongside Blocked / Collision markers),
 * a deliberately different visual context, so it isn't folded in here.
 */
export function BugTag() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase"
      style={{ color: 'var(--signal-blocked)', backgroundColor: 'var(--bg-tint)' }}
      title="A bug — a fix on the feature it broke"
    >
      <Bug className="h-3 w-3" aria-hidden />
      bug
    </span>
  );
}
