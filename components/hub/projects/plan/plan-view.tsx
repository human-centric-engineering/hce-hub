'use client';

/**
 * The Plan view (f-plan-view t-2; phase grouping f-phases §22 t2) — the project's
 * features in optimal working order (`planOrder()`), grouped into phase bands.
 * Owns only the per-feature expand/collapse state; ordering, grouping, and data
 * are the server's. The feature with live work is expanded by default so the view
 * opens on it. When the project has no phases, it renders as one flat, header-less
 * band — identical to the pre-phases plan.
 */
import { useState } from 'react';
import { PhaseBand } from '@/components/hub/projects/plan/phase-band';
import { PlanSummary } from '@/components/hub/projects/plan/plan-summary';
import {
  ManagePhasesDialog,
  type ManagedPhase,
} from '@/components/hub/projects/plan/manage-phases-dialog';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';

export function PlanView({
  plan,
  focusPhaseId = null,
}: {
  plan: ProjectPlanDTO;
  /** `?phase=` — the band to open and scroll to (§33 t-99). */
  focusPhaseId?: string | null;
}) {
  // The plan-ordered flat list (bands are a partition of it) — for the summary,
  // the default-expand pick, and the stable §N fallback.
  const allFeatures = plan.phases.flatMap((b) => b.features);

  // The real phases (drop the residual null-id band), ordinal-ordered — what the
  // manage dialog edits. The conditional narrows the nullable band fields.
  const managedPhases: ManagedPhase[] = plan.phases
    .flatMap((b) =>
      b.id !== null && b.name !== null && b.status !== null && b.ordinal !== null
        ? [
            {
              id: b.id,
              name: b.name,
              description: b.description,
              status: b.status,
              ordinal: b.ordinal,
              featureCount: b.features.length,
            },
          ]
        : []
    )
    .sort((a, b) => a.ordinal - b.ordinal);
  // Light {id,name} list for the per-row assign picker.
  const assignablePhases = managedPhases.map((p) => ({ id: p.id, name: p.name }));

  // The feature the view opens on: the one being actively worked (an `active`
  // task) — that's where attention is, even when an earlier-in-order in-flight
  // feature sorts above it — else the first non-shipped feature with tasks.
  const autoExpandId = (
    allFeatures.find((f) => f.tasks.some((t) => t.status === 'active')) ??
    allFeatures.find((f) => f.status !== 'shipped' && f.tasks.length > 0)
  )?.id;

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    autoExpandId ? { [autoExpandId]: true } : {}
  );

  if (allFeatures.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No features yet — this project&rsquo;s plan will appear here.
      </p>
    );
  }

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  // Header chrome only when there are real phases; otherwise the single residual
  // band is the whole plan and renders flat.
  const hasPhases = plan.phases.some((b) => b.id !== null);

  // Stable §N: the feature's own `number`, falling back to its plan position so a
  // legacy null-number feature still gets a deterministic ordinal across bands.
  const positionById = new Map(allFeatures.map((f, i) => [f.id, i + 1]));
  const ordinalFor = (id: string, number: number | null) => number ?? positionById.get(id) ?? 1;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PlanSummary features={allFeatures} />
        <ManagePhasesDialog projectId={plan.projectId} phases={managedPhases} />
      </div>
      <div className="mt-6 space-y-4">
        {plan.phases.map((band) => (
          <PhaseBand
            key={band.id ?? '__residual__'}
            band={band}
            showHeader={hasPhases}
            projectId={plan.projectId}
            projectRef={plan.projectSlug ?? plan.projectId}
            expanded={expanded}
            onToggle={toggle}
            ordinalFor={ordinalFor}
            // Open the band that holds the auto-expanded feature even if it would
            // otherwise collapse by default, so the view really "opens on" it.
            // ...or the band a `?phase=` link named, which is a deliberate request
            // to look at it and so outranks its collapse-by-default status.
            forceOpen={
              (autoExpandId != null && band.features.some((f) => f.id === autoExpandId)) ||
              (focusPhaseId != null && band.id === focusPhaseId)
            }
            focused={focusPhaseId != null && band.id === focusPhaseId}
            assignablePhases={assignablePhases}
          />
        ))}
      </div>
    </div>
  );
}
