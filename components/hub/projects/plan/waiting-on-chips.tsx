/**
 * The "waiting on `<dep>`" reason line for a blocked feature (f-status-model §20 t-37).
 *
 * A blocked feature's readiness verdict (`computeFeatureStatus`) carries the
 * unshipped dependencies it's waiting on; this renders them as brick-toned chips.
 * Shared by the Plan row (`feature-row`) and the feature page (`feature-view`) so
 * the two surfaces can't drift — the caller supplies the outer wrapper spacing.
 */
import type { WaitingOnRef } from '@/components/hub/projects/plan/types';

export function WaitingOnChips({
  waitingOn,
  className = '',
}: {
  waitingOn: WaitingOnRef[];
  className?: string;
}) {
  if (waitingOn.length === 0) return null;

  return (
    <span
      className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}
      style={{ color: 'var(--signal-blocked)' }}
    >
      <span>waiting on</span>
      {waitingOn.map((d) => (
        <span
          key={d.slug ?? d.title}
          className="rounded px-1.5 py-0.5 font-mono"
          style={{ backgroundColor: 'var(--signal-blocked-bg)' }}
          title={d.title}
        >
          {d.slug ?? d.title}
        </span>
      ))}
    </span>
  );
}
