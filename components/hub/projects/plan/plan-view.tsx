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
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';

export function PlanView({ plan }: { plan: ProjectPlanDTO }) {
  // The plan-ordered flat list (bands are a partition of it) — for the summary,
  // the default-expand pick, and the stable §N fallback.
  const allFeatures = plan.phases.flatMap((b) => b.features);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Prefer the feature with a task actually being worked (an `active` task) —
    // that's where attention is, even when an earlier-in-order in-flight feature
    // sorts above it. Fall back to the first non-shipped feature with tasks.
    const first =
      allFeatures.find((f) => f.tasks.some((t) => t.status === 'active')) ??
      allFeatures.find((f) => f.status !== 'shipped' && f.tasks.length > 0);
    return first ? { [first.id]: true } : {};
  });

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
      <PlanSummary features={allFeatures} />
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
          />
        ))}
      </div>
    </div>
  );
}
