'use client';

/**
 * The Plan view (f-plan-view t-2) — the project's features in optimal working
 * order (server-sorted by `planOrder()`), each expandable to its task table.
 * Owns only the expand/collapse UI state; the ordering + data are the server's.
 * One in-flight feature is expanded by default so the view opens on live work.
 */
import { useState } from 'react';
import { FeatureRow } from '@/components/hub/projects/plan/feature-row';
import { PlanSummary } from '@/components/hub/projects/plan/plan-summary';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';

export function PlanView({ plan }: { plan: ProjectPlanDTO }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Open the first non-shipped feature that has tasks — the live work.
    const first = plan.features.find((f) => f.status !== 'shipped' && f.tasks.length > 0);
    return first ? { [first.id]: true } : {};
  });

  if (plan.features.length === 0) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        No features yet — this project&rsquo;s plan will appear here.
      </p>
    );
  }

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  return (
    <div>
      <PlanSummary features={plan.features} />
      <div className="mt-6 space-y-3">
        {plan.features.map((feature, i) => (
          <FeatureRow
            key={feature.id}
            feature={feature}
            projectId={plan.projectId}
            ordinal={i + 1}
            expanded={!!expanded[feature.id]}
            onToggle={() => toggle(feature.id)}
          />
        ))}
      </div>
    </div>
  );
}
