/**
 * A swim lane on the Board (f-board-view t-2) — one row per project member (or
 * the terminal Unassigned bucket): a lane head (avatar + name + role + owned-
 * feature chips) followed by the five status columns of task cards.
 */
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Layers } from 'lucide-react';
import { initials } from '@/components/hub/projects/presentation';
import {
  COLUMN_META,
  BOARD_GRID,
  groupByColumn,
} from '@/components/hub/projects/board/presentation';
import { TaskCard } from '@/components/hub/projects/board/task-card';
import type { BoardLane } from '@/components/hub/projects/board/types';

export function SwimLane({ lane }: { lane: BoardLane }) {
  const byColumn = groupByColumn(lane);
  const isUnassigned = lane.member === null && lane.role === null;

  return (
    <div
      className="grid items-start gap-2 border-b py-3"
      style={{ ...BOARD_GRID, borderColor: 'var(--line-soft)', minHeight: '5rem' }}
    >
      {/* Lane head */}
      <div className="flex items-start gap-2.5 py-1.5">
        {lane.member ? (
          <Avatar className="h-9 w-9">
            {lane.member.image && <AvatarImage src={lane.member.image} alt="" />}
            <AvatarFallback className="text-xs">{initials(lane.member.name)}</AvatarFallback>
          </Avatar>
        ) : (
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed"
            style={{ borderColor: 'var(--line-strong)', color: 'var(--ink-mute)' }}
          >
            <Layers aria-hidden className="h-4 w-4" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13.5px] leading-tight font-medium">
            {lane.member ? lane.member.name : 'Unassigned'}
          </span>
          <span className="font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>
            {isUnassigned
              ? `${lane.taskCount} tasks · pull, don’t assign`
              : (lane.role ?? 'member')}
          </span>
          {lane.ownedFeatures.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {lane.ownedFeatures.map((f) => (
                <span
                  key={f.id}
                  className="rounded px-1 font-mono text-[9.5px]"
                  style={{ backgroundColor: 'var(--bg-tint)', color: 'var(--ink-faint)' }}
                  title={f.title}
                >
                  {f.slug ?? f.title}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status columns */}
      {COLUMN_META.map((col) => {
        const cards = byColumn[col.key];
        return (
          <div key={col.key} className="flex min-w-0 flex-col gap-1.5">
            {cards.length === 0 ? (
              <span
                className="py-2 text-center font-mono text-[10px]"
                style={{ color: 'var(--ink-ghost)' }}
              >
                ·
              </span>
            ) : (
              cards.map((card) => <TaskCard key={card.id} card={card} />)
            )}
          </div>
        );
      })}
    </div>
  );
}
