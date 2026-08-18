'use client';

/**
 * A phase band on the Plan view (f-phases §22 t2) — a collapsible group of
 * features filed under one phase, with a header showing the phase name, a
 * signal-toned status chip, and its feature count. `parked` (dormant idea-park)
 * and `complete` (done history) bands start **collapsed**; active/upcoming and the
 * residual "No phase" band start open. Every headered band can be toggled.
 *
 * When the project has no phases at all, the Plan is a single residual band and
 * the header is suppressed (`showHeader={false}`) so it reads exactly like the
 * pre-phases flat list — phases are an overlay, not a tax on projects without them.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { FeatureRow } from '@/components/hub/projects/plan/feature-row';
import { BorrowedTaskRow } from '@/components/hub/projects/plan/borrowed-task-row';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { phaseStatus, shortDate } from '@/components/hub/projects/plan/presentation';
import type { PlanPhaseBand } from '@/components/hub/projects/plan/types';

export function PhaseBand({
  band,
  showHeader,
  projectId,
  projectRef,
  expanded,
  onToggle,
  ordinalFor,
  forceOpen = false,
  assignablePhases,
}: {
  band: PlanPhaseBand;
  /** Suppressed when the project has no phases (residual band = the whole plan). */
  showHeader: boolean;
  projectId: string;
  projectRef: string;
  /** Feature-id → expanded flag (the feature's own task-table toggle, lifted). */
  expanded: Record<string, boolean>;
  onToggle: (featureId: string) => void;
  /** Stable §N for a feature (its `number`, with a plan-position fallback). */
  ordinalFor: (featureId: string, featureNumber: number | null) => number;
  /** Open regardless of status — this band holds the view's auto-expanded feature. */
  forceOpen?: boolean;
  /** The project's phases, for each row's assign picker (f-phases §22 t3). */
  assignablePhases: { id: string; name: string }[];
}) {
  const isParked = band.status === 'parked';
  // Collapsed by default when there's nothing to act on: `parked` (deliberately
  // set aside) and `complete` (done history). Active/upcoming phases and the
  // residual "No phase" band (uncategorised but live work) open expanded — as does
  // any band holding the auto-expanded feature (forceOpen), so the view opens on it.
  const collapsedByDefault = isParked || band.status === 'complete';
  const [open, setOpen] = useState(forceOpen || !collapsedByDefault);

  // `band.rows` — features INTERLEAVED with any tasks borrowed into this phase, in
  // readiness order (§32 t-95). Ordering is the server's; this only renders it.
  //
  // The `??` is not defensive noise: this DTO is hand-mirrored and reaches the
  // client through an unchecked `parseApiResponse` cast, so `rows` being required
  // by the type proves nothing at runtime. During a deploy rollout a response from
  // the older server carries `features` and no `rows`, and a bare `.map` would
  // white-screen the whole Plan over a presentational addition. Degrade to exactly
  // the pre-t-95 rendering instead.
  const bandRows =
    band.rows ?? band.features.map((feature) => ({ kind: 'feature' as const, feature }));
  const rows = bandRows.map((row) =>
    row.kind === 'task' ? (
      <BorrowedTaskRow key={`t:${row.task.id}`} task={row.task} projectRef={projectRef} />
    ) : (
      <FeatureRow
        key={row.feature.id}
        feature={row.feature}
        projectId={projectId}
        projectRef={projectRef}
        ordinal={ordinalFor(row.feature.id, row.feature.number)}
        expanded={!!expanded[row.feature.id]}
        onToggle={() => onToggle(row.feature.id)}
        phases={assignablePhases}
        currentPhaseId={band.id}
      />
    )
  );

  // No phases in the project → the residual band is the whole plan, no chrome.
  if (!showHeader) {
    return <div className="space-y-3">{rows}</div>;
  }

  const tone = band.status ? phaseStatus(band.status) : null;
  const heading = band.name ?? 'No phase';
  const count = band.features.length;
  // Borrowed rows are NOT features (a borrow isn't membership), so they can't join
  // the feature count — but a band whose only content is borrowed would then read
  // "0 features", and if it is `complete`/`parked` it is collapsed too: unlabelled
  // AND hidden. Count them separately so the header says something is in there.
  const borrowedCount = bandRows.filter((r) => r.kind === 'task').length;

  // The phase's own lifecycle, shown only where it says something: a started date
  // once it has begun, and a finished date only when it actually finished. A
  // `complete` phase shows the span; an `upcoming` one shows nothing rather than
  // an empty placeholder. Derived coherently since f-phases §22 and rendered
  // nowhere until now (§33 t-99).
  const lifecycle = [
    band.startedAt ? `started ${shortDate(band.startedAt)}` : null,
    band.completedAt ? `finished ${shortDate(band.completedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className={isParked ? 'opacity-80' : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
      >
        <ChevronRight
          aria-hidden
          className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-foreground text-sm font-semibold">{heading}</span>
        {
          tone ? (
            <StatusPill tone={tone.tone} label={tone.label} />
          ) : band.status === 'parked' ? (
            <span className="text-muted-foreground text-xs font-medium">parked</span>
          ) : null /* residual "No phase" band — no status chip */
        }
        <span className="text-muted-foreground text-xs">
          {count} {count === 1 ? 'feature' : 'features'}
          {borrowedCount > 0 && ` · ${borrowedCount} borrowed`}
          {lifecycle && ` · ${lifecycle}`}
        </span>
      </button>
      {/*
        The authored intent — why this grouping exists and what would make it
        complete. Rendered under the header rather than in it: it is prose, and
        the header is a row of labels. Only when open, so a collapsed band stays
        one line, and clamped to two lines because a band is a summary — the full
        text belongs on a phase page (idea #9).
      */}
      {open && band.description && (
        <p className="text-muted-foreground mt-1 line-clamp-2 px-2 pl-8 text-xs leading-relaxed">
          {band.description}
        </p>
      )}
      {open && <div className="mt-3 space-y-3">{rows}</div>}
    </section>
  );
}
