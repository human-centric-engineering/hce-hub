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
import { MemberSelect } from '@/components/hub/projects/member-select';
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
  // Optimistic selection — the trigger shows the picked member immediately. Re-adopt
  // the server value only when the `assignee` prop actually changes (i.e. the parent
  // refetch landed), never on the `busy` toggle — otherwise busy flipping false at
  // the end of a successful write would momentarily revert to the stale prop before
  // the refetch arrives (a flash back to the old member). On failure, the catch below
  // reverts the optimistic pick explicitly.
  const [selected, setSelected] = useState<string | null>(assignee?.id ?? null);
  useEffect(() => {
    setSelected(assignee?.id ?? null);
  }, [assignee?.id]);

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
    <MemberSelect
      members={members}
      value={selected}
      onSelect={(v) => void reassign(v)}
      disabled={busy}
      placeholder="Unassigned"
      ariaLabel="Assignee"
      invalid={failed}
      invalidTitle="Could not reassign — try again."
      validTitle="Assign this task to a member"
    />
  );
}
