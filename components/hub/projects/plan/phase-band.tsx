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
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { phaseStatus } from '@/components/hub/projects/plan/presentation';
import type { PlanPhaseBand } from '@/components/hub/projects/plan/types';

export function PhaseBand({
  band,
  showHeader,
  projectId,
  projectRef,
  expanded,
  onToggle,
  ordinalFor,
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
}) {
  const isParked = band.status === 'parked';
  // Collapsed by default when there's nothing to act on: `parked` (deliberately
  // set aside) and `complete` (done history). Active/upcoming phases and the
  // residual "No phase" band (uncategorised but live work) open expanded.
  const collapsedByDefault = isParked || band.status === 'complete';
  const [open, setOpen] = useState(!collapsedByDefault);

  const rows = band.features.map((feature) => (
    <FeatureRow
      key={feature.id}
      feature={feature}
      projectId={projectId}
      projectRef={projectRef}
      ordinal={ordinalFor(feature.id, feature.number)}
      expanded={!!expanded[feature.id]}
      onToggle={() => onToggle(feature.id)}
    />
  ));

  // No phases in the project → the residual band is the whole plan, no chrome.
  if (!showHeader) {
    return <div className="space-y-3">{rows}</div>;
  }

  const tone = band.status ? phaseStatus(band.status) : null;
  const heading = band.name ?? 'No phase';
  const count = band.features.length;

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
        </span>
      </button>
      {open && <div className="mt-3 space-y-3">{rows}</div>}
    </section>
  );
}
