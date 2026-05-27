/**
 * Unit tests: computeGateVerdict (Phase 4 minimal CI gate).
 *
 * @see lib/orchestration/evaluations/gate.ts
 */

import { describe, it, expect } from 'vitest';
import { computeGateVerdict } from '@/lib/orchestration/evaluations/gate';

describe('computeGateVerdict', () => {
  it('returns null when gateConfig is absent', () => {
    expect(computeGateVerdict(null, { stats: { judge_agent: { mean: 0.95 } } })).toBeNull();
    expect(computeGateVerdict(undefined, { stats: { judge_agent: { mean: 0.95 } } })).toBeNull();
  });

  it('returns null when summary is absent', () => {
    const cfg = { thresholds: [{ metricSlug: 'judge_agent', minMean: 0.8 }] };
    expect(computeGateVerdict(cfg, null)).toBeNull();
    expect(computeGateVerdict(cfg, undefined)).toBeNull();
    expect(computeGateVerdict(cfg, {})).toBeNull();
  });

  it('passes when every minMean threshold is met', () => {
    const verdict = computeGateVerdict(
      {
        thresholds: [
          { metricSlug: 'judge_agent', minMean: 0.8 },
          { metricSlug: 'faithfulness', minMean: 0.7 },
        ],
      },
      { stats: { judge_agent: { mean: 0.85 }, faithfulness: { mean: 0.75 } } }
    );
    expect(verdict?.passed).toBe(true);
    expect(verdict?.reasons).toHaveLength(2);
    expect(verdict?.reasons.every((r) => r.passed)).toBe(true);
  });

  it('fails when any minMean threshold is missed', () => {
    const verdict = computeGateVerdict(
      {
        thresholds: [
          { metricSlug: 'judge_agent', minMean: 0.8 },
          { metricSlug: 'faithfulness', minMean: 0.9 },
        ],
      },
      { stats: { judge_agent: { mean: 0.85 }, faithfulness: { mean: 0.75 } } }
    );
    expect(verdict?.passed).toBe(false);
    expect(verdict?.reasons[0].passed).toBe(true);
    expect(verdict?.reasons[1].passed).toBe(false);
    expect(verdict?.reasons[1].got).toBe(0.75);
    expect(verdict?.reasons[1].want).toBe(0.9);
  });

  it('honours minPassRate alongside minMean', () => {
    const verdict = computeGateVerdict(
      {
        thresholds: [{ metricSlug: 'judge_agent', minMean: 0.8, minPassRate: 0.9 }],
      },
      { stats: { judge_agent: { mean: 0.85, passRate: 0.85 } } }
    );
    // Mean passes (0.85 >= 0.8), passRate fails (0.85 < 0.9), so overall fails.
    expect(verdict?.passed).toBe(false);
    expect(verdict?.reasons).toHaveLength(2);
    expect(verdict?.reasons[0].threshold).toBe('mean');
    expect(verdict?.reasons[0].passed).toBe(true);
    expect(verdict?.reasons[1].threshold).toBe('passRate');
    expect(verdict?.reasons[1].passed).toBe(false);
  });

  it('fails when a metricSlug is missing from summary.stats (no silent absence)', () => {
    const verdict = computeGateVerdict(
      { thresholds: [{ metricSlug: 'absent_metric', minMean: 0.5 }] },
      { stats: { judge_agent: { mean: 0.9 } } }
    );
    expect(verdict?.passed).toBe(false);
    expect(verdict?.reasons[0].got).toBeNull();
  });

  it('fails when the stats value is non-numeric (null) without crashing', () => {
    const verdict = computeGateVerdict(
      { thresholds: [{ metricSlug: 'judge_agent', minMean: 0.5 }] },
      { stats: { judge_agent: { mean: null } } }
    );
    expect(verdict?.passed).toBe(false);
    expect(verdict?.reasons[0].got).toBeNull();
  });

  it('treats exact-equal as a pass (>= not >)', () => {
    const verdict = computeGateVerdict(
      { thresholds: [{ metricSlug: 'judge_agent', minMean: 0.85 }] },
      { stats: { judge_agent: { mean: 0.85 } } }
    );
    expect(verdict?.passed).toBe(true);
  });
});
