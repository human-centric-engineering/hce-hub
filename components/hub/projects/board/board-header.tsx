/**
 * The Board's sticky column header (f-board-view t-2): the Owner label + the five
 * status columns, each with a count chip and a subtitle.
 */
import { COLUMN_META, BOARD_GRID } from '@/components/hub/projects/board/presentation';
import type { BoardColumn } from '@/components/hub/projects/board/types';

const labelClass = 'font-mono text-[10px] tracking-wider uppercase';
const subClass = 'text-[10.5px]';

export function BoardHeader({ columnTotals }: { columnTotals: Record<BoardColumn, number> }) {
  return (
    <div className="bg-background sticky top-0 z-10 grid gap-2 border-b py-3" style={BOARD_GRID}>
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
