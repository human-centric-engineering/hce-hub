'use client';

/**
 * ClaimFeatureButton (f-feature-planning §18 t-4).
 *
 * The UI trigger for `claim_feature` — the "spot the best next feature and pick
 * it up right there" action (owner's self-hosting flow). Shown on an **unowned**
 * feature (the feature page header + the Plan row); POSTs the shared
 * `claimFeature` route and, on success, `router.refresh()`es so the server-
 * rendered surface re-reads the new owner + `in_flight` status. A failed write is
 * surfaced, never swallowed. Two visual variants: `primary` (the feature page)
 * and `inline` (the compact Plan-row affordance).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Hand } from 'lucide-react';

export function ClaimFeatureButton({
  projectId,
  featureId,
  variant = 'primary',
}: {
  projectId: string;
  featureId: string;
  variant?: 'primary' | 'inline';
}) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = claiming || pending;

  const claim = async () => {
    setClaiming(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(featureId)}/claim`,
        { method: 'POST' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Re-render the server surface so the new owner + in_flight status show.
      startTransition(() => router.refresh());
    } catch {
      setError(true); // surface it — never a silent write failure; retryable
    } finally {
      setClaiming(false);
    }
  };

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={() => void claim()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--bg-tint)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        aria-label="Claim this feature"
      >
        {busy ? 'Claiming…' : 'Claim'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void claim()}
        disabled={busy}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: 'var(--accent)',
          borderColor: 'var(--accent)',
          color: 'var(--accent-fg, #fff)',
        }}
      >
        <Hand className="h-3.5 w-3.5" />
        {busy ? 'Claiming…' : 'Claim feature'}
      </button>
      {error && (
        <p className="text-xs" style={{ color: 'var(--signal-blocked)' }}>
          Couldn&rsquo;t claim just now — try again.
        </p>
      )}
    </div>
  );
}
