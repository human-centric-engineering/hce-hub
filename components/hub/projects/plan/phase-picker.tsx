'use client';

/**
 * PhasePicker (f-phases §22 t3) — the compact per-feature control on a Plan row
 * that files the feature under a phase, or unfiles it ("No phase"). **Member-tier**
 * (any member may organise the roadmap), so it's shown on every feature when the
 * project has phases. PATCHes the assign route and `router.refresh()`es so the
 * server-rendered Plan re-groups; a failed write reverts (the Select is controlled
 * by the server truth) and is surfaced via the trigger title — never swallowed.
 *
 * The current phase is the band the row renders in (`currentPhaseId`), so no extra
 * field on the feature payload is needed.
 */
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layers } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

/** Radix Select forbids an empty value, so the residual "No phase" gets a sentinel. */
const NONE = '__none__';

export function PhasePicker({
  projectId,
  featureId,
  currentPhaseId,
  phases,
}: {
  projectId: string;
  featureId: string;
  currentPhaseId: string | null;
  phases: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Optimistic selection — the trigger shows the picked phase immediately (no
  // snap-back to the old value while the PATCH + refresh run). Re-adopt the server
  // value once the write settles; on failure it reverts (below).
  const [selected, setSelected] = useState<string | null>(currentPhaseId);
  useEffect(() => {
    if (!busy && !pending) setSelected(currentPhaseId);
  }, [currentPhaseId, busy, pending]);

  const assign = async (value: string) => {
    const phaseId = value === NONE ? null : value;
    if (phaseId === selected) return; // no-op
    setSelected(phaseId);
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/phase`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phaseId }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      startTransition(() => router.refresh());
    } catch {
      setSelected(currentPhaseId); // revert the optimistic pick
      setFailed(true); // never silent
    } finally {
      setBusy(false);
    }
  };

  return (
    <Select
      value={selected ?? NONE}
      onValueChange={(v) => void assign(v)}
      disabled={busy || pending}
    >
      <SelectTrigger
        className="text-muted-foreground hover:text-foreground h-7 w-auto max-w-[12rem] gap-1.5 text-xs"
        aria-label="Phase"
        title={failed ? 'Could not move this feature — try again.' : 'Move this feature to a phase'}
      >
        <Layers className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        {failed && <span className="text-destructive">!</span>}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No phase</SelectItem>
        {phases.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
