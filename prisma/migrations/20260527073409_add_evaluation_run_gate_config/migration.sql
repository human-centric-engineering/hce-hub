-- Phase 4 (minimal CI gate): per-run pass/fail thresholds.
--
-- Adds nullable `gateConfig` JSON column to `ai_evaluation_run`. Set by
-- callers (typically CI) at run creation; read by the run GET handler
-- to compute a `gate.passed` block from the run's `summary.stats`.
--
-- Shape: { thresholds: [{ metricSlug, minMean?, minPassRate? }] }
-- Worker is unchanged — it doesn't see this column.

ALTER TABLE "ai_evaluation_run"
  ADD COLUMN "gateConfig" JSONB;
