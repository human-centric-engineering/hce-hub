'use client';

/**
 * A swim lane on the Board (f-board-view t-2) — one row per project member (or
 * the terminal Unassigned bucket): a lane head (avatar + name + role + owned-
 * feature chips) followed by the three status columns of task cards.
 *
 * Two display rules land here (§33-sweep):
 * - **t-107** — `hideBugs` drops `bug`-kind cards from the **Assigned** column
 *   only. Bugs keep the owner cascade, so they arrive assigned and accumulate
 *   there; a bug already Active is work in progress and stays visible.
 * - **t-108** — the **Merged** column shows the newest few and folds the rest
 *   behind a per-lane control. Merged work is history: it should be present
 *   without making every other lane a long scroll away. The cap is per lane, not
 *   per board, or one busy lane would spend the whole budget.
 */
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Layers } from 'lucide-react';
import { initials } from '@/components/hub/projects/presentation';
import {
  COLUMN_META,
  BOARD_GRID,
  MERGED_VISIBLE,
  groupByColumn,
} from '@/components/hub/projects/board/presentation';
import { TaskCard } from '@/components/hub/projects/board/task-card';
import type { BoardLane } from '@/components/hub/projects/board/types';

export function SwimLane({ lane, hideBugs }: { lane: BoardLane; hideBugs: boolean }) {
  const byColumn = groupByColumn(lane);
  const isUnassigned = lane.member === null && lane.role === null;
  const [showAllMerged, setShowAllMerged] = useState(false);
  const mergedHidden = Math.max(0, byColumn.merged.length - MERGED_VISIBLE);
  const takeable = byColumn.claimed.length;
  const mergedListId = `merged-${lane.key}`;

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
              ? // "pull, don't assign" described the §5 doctrine, not this UI: the
                // affordance here IS assign (to yourself, which is the pull). The
                // lane went from theoretical to real in §32 t-89, so its copy is
                // now read rather than imagined.
                //
                // Counts the ASSIGNED column, not `lane.taskCount`. That field is
                // every task in the lane including merged ones, so an unassigned
                // lane holding finished work read "3 tasks · free to take" when
                // none of the three were takeable — wrong before this branch, and
                // t-107's filter would only have added a second way to disagree.
                // Unfiltered on purpose: a hidden bug IS still free to take, and
                // the header's "N bugs hidden" chip explains the difference.
                `${takeable} ${takeable === 1 ? 'task' : 'tasks'} · free to take`
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
        const all = byColumn[col.key];
        // Assigned drops bugs when the toggle is on; Merged caps to the newest few.
        // Neither filter touches the header counts — those stay true (see BoardHeader).
        const cards =
          col.key === 'claimed' && hideBugs
            ? all.filter((c) => c.kind !== 'bug')
            : col.key === 'merged' && !showAllMerged
              ? all.slice(0, MERGED_VISIBLE)
              : all;
        return (
          <div
            key={col.key}
            id={col.key === 'merged' ? mergedListId : undefined}
            className="flex min-w-0 flex-col gap-1.5"
          >
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
            {col.key === 'merged' && mergedHidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAllMerged((v) => !v)}
                aria-expanded={showAllMerged}
                aria-controls={mergedListId}
                className="focus-visible:ring-ring rounded px-1 py-0.5 text-left text-[10px] underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                style={{ color: 'var(--ink-mute)' }}
              >
                {showAllMerged ? 'Show fewer' : `Show ${mergedHidden} more`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
