/**
 * The Plan view summary line (f-plan-view t-2):
 * `N features · X/Y tasks merged · [toned status pills]` + the "sorted by …" hint.
 */
import { Sparkles } from 'lucide-react';
import type { PlanFeature, FeatureStatus } from '@/components/hub/projects/plan/types';

const BANDS: { key: FeatureStatus; label: string; tone: string }[] = [
  { key: 'shipped', label: 'shipped', tone: 'merged' },
  { key: 'in_flight', label: 'in flight', tone: 'pr' },
  { key: 'available', label: 'available', tone: 'available' },
  { key: 'blocked', label: 'blocked', tone: 'blocked' },
];

export function PlanSummary({ features }: { features: PlanFeature[] }) {
  const counts: Partial<Record<FeatureStatus, number>> = {};
  for (const f of features) counts[f.status] = (counts[f.status] ?? 0) + 1;
  const totalTasks = features.reduce((n, f) => n + f.progress.total, 0);
  const mergedTasks = features.reduce((n, f) => n + f.progress.merged, 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span>
          <span className="font-medium">{features.length}</span>{' '}
          <span className="text-muted-foreground">features</span>
        </span>
        <span style={{ color: 'var(--ink-faint)' }}>·</span>
        <span>
          <span className="font-medium">{mergedTasks}</span>
          <span style={{ color: 'var(--ink-faint)' }}>/{totalTasks}</span>{' '}
          <span className="text-muted-foreground">tasks merged</span>
        </span>
        {BANDS.some((b) => (counts[b.key] ?? 0) > 0) && (
          <span style={{ color: 'var(--ink-faint)' }}>·</span>
        )}
        <span className="flex flex-wrap items-center gap-1.5">
          {BANDS.filter((b) => (counts[b.key] ?? 0) > 0).map((b) => (
            <span
              key={b.key}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: `var(--signal-${b.tone}-bg)`,
                color: `var(--signal-${b.tone})`,
              }}
            >
              <span className="font-medium">{counts[b.key]}</span> {b.label}
            </span>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-mute)' }}>
        <Sparkles aria-hidden className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
        <span>Sorted by status, then dependency depth — top is most ready to advance.</span>
      </div>
    </div>
  );
}
