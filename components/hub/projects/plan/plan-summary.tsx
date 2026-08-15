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
  // EVERY task, bugs and post-ship work included (owner, §32 t-94): "a bug and an
  // enhancement are both types of task — that's the honest accounting."
  //
  // Deliberately NOT `progress.total`/`progress.merged`, which are the *feature*
  // ratio and exclude bugs and post-ship work so neither can dent a feature's
  // build-out (f-bug-handling §22-02 · §32 t-79). That exclusion is right one row
  // down and wrong here: the two lines answer different questions — "did this
  // feature's build-out complete?" versus "how much of this project's work is
  // done?" — and summing the feature ratio made the project line silently drop
  // every bug and every post-ship task. It read `76/81` directly beneath a header
  // saying `96 tasks`, with nothing to explain the 15.
  //
  // Counts what the Plan RENDERS, so it reconciles with the project header. A
  // parked band is collapsed, not suppressed, so its tasks are still counted.
  const totalTasks = features.reduce((n, f) => n + f.tasks.length, 0);
  const mergedTasks = features.reduce(
    (n, f) => n + f.tasks.filter((t) => t.status === 'merged').length,
    0
  );

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
