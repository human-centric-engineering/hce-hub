'use client';

/**
 * AssigneePicker (f-task-assignment §22 t2) — the task sheet's control for who a
 * task is assigned to. Shown on an **open** task (any member may reassign — call 2,
 * open/trusting); a merged task shows its doer read-only instead (credit — you
 * don't reassign finished work).
 *
 * PATCHes the shared `assign_task` route and, on success, hands the soft handoff
 * warnings back to the sheet (`onReassigned`) so it can refetch + surface them. A
 * failed write reverts the optimistic pick (the Select is re-driven by the server
 * `assignee`) and is surfaced via the trigger — never swallowed.
 */
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { initials } from '@/components/hub/projects/presentation';
import { firstName } from '@/components/hub/projects/plan/presentation';
import type { UserRef } from '@/components/hub/projects/types';
import type { CollisionWarning } from '@/components/hub/projects/task-sheet/types';

export function AssigneePicker({
  projectId,
  taskId,
  assignee,
  members,
  onReassigned,
}: {
  projectId: string;
  taskId: string;
  /** The current assignee (`null` when unassigned or erased). */
  assignee: UserRef | null;
  /** The project's members — the options. */
  members: UserRef[];
  /** Called with the write's soft warnings so the sheet refetches + surfaces them. */
  onReassigned: (warnings: CollisionWarning[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Optimistic selection — the trigger shows the picked member immediately; the
  // server `assignee` re-adopts once the write settles (and reverts on failure).
  const [selected, setSelected] = useState<string | null>(assignee?.id ?? null);
  useEffect(() => {
    if (!busy) setSelected(assignee?.id ?? null);
  }, [assignee?.id, busy]);

  const reassign = async (assigneeUserId: string) => {
    if (assigneeUserId === selected) return; // no-op — already assigned to them
    setSelected(assigneeUserId);
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/assignee`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeUserId }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { warnings: CollisionWarning[] } };
      onReassigned(json.data.warnings);
    } catch {
      setSelected(assignee?.id ?? null); // revert the optimistic pick
      setFailed(true); // never silent
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select value={selected ?? undefined} onValueChange={(v) => void reassign(v)} disabled={busy}>
      <SelectTrigger
        className="h-7 w-auto max-w-[12rem] gap-1.5 text-xs"
        aria-label="Assignee"
        title={failed ? 'Could not reassign — try again.' : 'Assign this task to a member'}
      >
        {failed && <span className="text-destructive">!</span>}
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex items-center gap-1.5">
              <Avatar className="h-4 w-4">
                {m.image && <AvatarImage src={m.image} alt="" />}
                <AvatarFallback className="text-[8px]">{initials(m.name)}</AvatarFallback>
              </Avatar>
              {firstName(m.name)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
