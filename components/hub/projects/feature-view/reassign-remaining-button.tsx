'use client';

/**
 * ReassignRemainingButton (f-task-assignment §22 t2, design call 3) — the feature
 * page control that hands a feature's **remaining (unmerged) tasks** to another
 * member in one action (a dev goes off / is pulled onto something else). Merged
 * tasks keep their doer credit and the feature's owner is untouched — this moves
 * the tasks, not the feature.
 *
 * Any member may reassign (call 2). Gated behind a trigger so a bulk move is
 * deliberate, not a stray click: the button reveals a member Select; picking a
 * member PATCHes the shared route and `router.refresh()`es so the server-rendered
 * task rows re-read the new assignees. A soft outcome line reports what moved (and
 * any active-work handoffs); a failed write is surfaced, never swallowed.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { MemberSelect } from '@/components/hub/projects/member-select';
import type { UserRef } from '@/components/hub/projects/types';

type Outcome = { reassigned: number; warnings: number } | null;

export function ReassignRemainingButton({
  projectId,
  featureId,
  members,
}: {
  projectId: string;
  featureId: string;
  /** The project's members — the options. */
  members: UserRef[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();

  const reassign = async (assigneeUserId: string) => {
    setBusy(true);
    setFailed(false);
    setOutcome(null);
    try {
      const res = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/assignee`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigneeUserId }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { reassigned: number; warnings: unknown[] } };
      setOutcome({ reassigned: json.data.reassigned, warnings: json.data.warnings.length });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setFailed(true); // never silent
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-fit items-center gap-1.5 text-xs hover:underline"
          style={{ color: 'var(--ink-mute)' }}
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          Reassign remaining tasks
        </button>
        {outcome && (
          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            {outcome.reassigned === 0
              ? 'Nothing to reassign — no open tasks.'
              : `Reassigned ${outcome.reassigned} task${outcome.reassigned === 1 ? '' : 's'}.`}
            {outcome.warnings > 0 &&
              ` ${outcome.warnings} were being actively worked — those handoffs were flagged.`}
          </p>
        )}
        {failed && (
          <p className="text-xs" style={{ color: 'var(--signal-blocked)' }}>
            Couldn&rsquo;t reassign just now — try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Hand remaining tasks to
        </span>
        <MemberSelect
          members={members}
          onSelect={(v) => void reassign(v)}
          disabled={busy || pending}
          placeholder="Choose a member…"
          ariaLabel="Reassign remaining tasks to"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs"
          style={{ color: 'var(--ink-mute)' }}
        >
          Cancel
        </button>
      </div>
      {/* A failed write keeps the picker open (retry a pick right here) — but the
          failure must still be visible, never silent. */}
      {failed && (
        <p className="text-xs" style={{ color: 'var(--signal-blocked)' }}>
          Couldn&rsquo;t reassign just now — try again.
        </p>
      )}
    </div>
  );
}
