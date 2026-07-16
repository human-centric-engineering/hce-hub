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
import { COLUMN_META, BOARD_GRID } from '@/components/hub/projects/board/presentation';
import type { BoardColumn } from '@/components/hub/projects/board/types';

const labelClass = 'font-mono text-[10px] tracking-wider uppercase';
const subClass = 'text-[10.5px]';

export function BoardHeader({ columnTotals }: { columnTotals: Record<BoardColumn, number> }) {
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
            <span
              className="rounded px-1 font-mono text-[10px]"
              style={{ backgroundColor: 'var(--bg-tint)', color: 'var(--ink-faint)' }}
            >
              {columnTotals[col.key]}
            </span>
          </div>
          <span className={subClass} style={{ color: 'var(--ink-faint)' }}>
            {col.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
