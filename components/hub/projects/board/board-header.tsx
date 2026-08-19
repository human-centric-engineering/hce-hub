/**
 * The Board's column header (f-board-view t-2): the Owner label + the five status
 * columns, each with a count chip and a subtitle.
 *
 * Not `position: sticky`: the header sits inside the board's `overflow-x-auto`
 * wrapper, which CSS resolves to a both-axes scroll container of content height,
 * so a `sticky top-0` never pins on page scroll (it would just scroll away — the
 * §10 `/code-review` finding). A genuinely viewport-pinned header would need the
 * board to own a height-constrained vertical scroll region (nested scrollbars);
 * that trade isn't worth it for this header, so it scrolls with the lanes.
 */
import { Bug } from 'lucide-react';
import { COLUMN_META, BOARD_GRID } from '@/components/hub/projects/board/presentation';
import type { BoardColumn } from '@/components/hub/projects/board/types';

const labelClass = 'font-mono text-[10px] tracking-wider uppercase';
const subClass = 'text-[10.5px]';

export function BoardHeader({
  columnTotals,
  hideBugs,
  hiddenBugs,
  onToggleBugs,
}: {
  columnTotals: Record<BoardColumn, number>;
  /** Whether bug cards are currently hidden from the Assigned column (t-107). */
  hideBugs: boolean;
  /** How many bug cards the toggle hides — shown as the delta, never subtracted. */
  hiddenBugs: number;
  onToggleBugs: () => void;
}) {
  return (
    <div className="bg-background grid gap-2 border-b py-3" style={BOARD_GRID}>
      <div className="flex flex-col gap-1">
        <span className={labelClass} style={{ color: 'var(--ink-mute)' }}>
          Owner
        </span>
        <span className={subClass} style={{ color: 'var(--ink-faint)' }}>
          grouped by person
        </span>
      </div>
      {COLUMN_META.map((col) => (
        <div key={col.key} className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className={labelClass} style={{ color: 'var(--ink-mute)' }}>
              {col.label}
            </span>
            {/* The count is the TRUE total, always — it does not move when the
                toggle hides cards. A count that changes with a display filter is
                the quiet lie §32 t-94 spent a task removing; the delta goes on
                the toggle instead, where it reads as "and N more you can't see". */}
            <span
              className="rounded px-1 font-mono text-[10px]"
              style={{ backgroundColor: 'var(--bg-tint)', color: 'var(--ink-faint)' }}
            >
              {columnTotals[col.key]}
            </span>
            {/* Shown while anything IS hidden, and also whenever the viewer has
                opted in — otherwise the last bug merging removes the only control
                while `hideBugs` stays true in storage, leaving a preference set
                with nothing on screen admitting it. */}
            {col.key === 'claimed' && (hiddenBugs > 0 || hideBugs) && (
              <button
                type="button"
                onClick={onToggleBugs}
                aria-pressed={hideBugs}
                title={
                  hideBugs
                    ? 'Show bug cards in the Assigned column'
                    : 'Hide bug cards from the Assigned column'
                }
                className="focus-visible:ring-ring inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-[var(--bg-tint)] focus-visible:ring-2 focus-visible:outline-none"
                style={{ color: 'var(--ink-faint)' }}
              >
                <Bug className="h-3 w-3" aria-hidden />
                {/* The visible text IS the accessible name (text content beats
                    `title`), so it has to read sensibly on its own; `aria-pressed`
                    carries the on/off state rather than the label doing it. */}
                {!hideBugs
                  ? 'hide bugs'
                  : hiddenBugs === 0
                    ? 'bugs hidden'
                    : `${hiddenBugs} bug${hiddenBugs === 1 ? '' : 's'} hidden`}
              </button>
            )}
          </div>
          <span className={subClass} style={{ color: 'var(--ink-faint)' }}>
            {col.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
