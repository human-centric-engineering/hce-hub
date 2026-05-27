/**
 * Evaluation-run gate computation (Phase 4 minimal CI gate).
 *
 * Takes a run's persisted `gateConfig` (thresholds the operator wanted
 * to assert at submit time) plus its post-completion `summary.stats`,
 * and produces a `{ passed, reasons }` block the CI caller can read
 * directly from the run GET endpoint.
 *
 * Pure function — no DB, no logging — so it's easy to unit-test in
 * isolation. The shape is namespaced to keep it out of the run row's
 * existing summary surface, which is built by the worker and shouldn't
 * be coupled to a caller-provided contract.
 */

import type { GateConfig } from '@/lib/validations/orchestration-evaluations';

export interface GateReason {
  metricSlug: string;
  /** Which threshold was checked. */
  threshold: 'mean' | 'passRate';
  /** Observed value from `summary.stats[slug]`. Null when the slug has no stats row. */
  got: number | null;
  /** Threshold value the caller asserted. */
  want: number;
  /** True when the observed value met or exceeded the threshold. */
  passed: boolean;
}

export interface GateVerdict {
  /** True only when every threshold passed. */
  passed: boolean;
  /** Per-threshold rationale, ordered as configured. */
  reasons: GateReason[];
}

interface SummaryStatsRow {
  mean?: number | null;
  passRate?: number | null;
}

/**
 * Compute the gate verdict for a completed run. Returns `null` when
 * either `gateConfig` or the run summary is missing — callers should
 * suppress the `gate` block in that case rather than emit a vacuous
 * "passed: true".
 *
 * Per-threshold semantics:
 * - A threshold with `minMean` set passes when
 *   `stats[metricSlug].mean >= minMean`.
 * - A threshold with `minPassRate` set passes when
 *   `stats[metricSlug].passRate >= minPassRate`.
 * - A threshold with both runs both checks; both must pass for that
 *   threshold to pass.
 * - A missing `stats[metricSlug]` row fails the threshold (we'd rather
 *   surface a real failure than silently treat absence as a pass).
 */
export function computeGateVerdict(
  gateConfig: GateConfig | null | undefined,
  summary: { stats?: Record<string, SummaryStatsRow> } | null | undefined
): GateVerdict | null {
  if (!gateConfig || !summary || !summary.stats) return null;

  const reasons: GateReason[] = [];
  for (const threshold of gateConfig.thresholds) {
    const row = summary.stats[threshold.metricSlug];
    if (threshold.minMean !== undefined) {
      const got = typeof row?.mean === 'number' ? row.mean : null;
      reasons.push({
        metricSlug: threshold.metricSlug,
        threshold: 'mean',
        got,
        want: threshold.minMean,
        passed: got !== null && got >= threshold.minMean,
      });
    }
    if (threshold.minPassRate !== undefined) {
      const got = typeof row?.passRate === 'number' ? row.passRate : null;
      reasons.push({
        metricSlug: threshold.metricSlug,
        threshold: 'passRate',
        got,
        want: threshold.minPassRate,
        passed: got !== null && got >= threshold.minPassRate,
      });
    }
  }

  return {
    passed: reasons.every((r) => r.passed),
    reasons,
  };
}
