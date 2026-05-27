-- Phase 3.5a: pairwise verdicts on experiments.
--
-- Adds a nullable JSON column `pairwiseVerdict` to `ai_experiment`,
-- written by the `/experiments/:id/verdicts` endpoint after running
-- the `pairwise_judge_agent` grader across both variants' per-case
-- outputs. Shape: PairwiseVerdictSummary in `types/orchestration.ts`.
--
-- Single-blob storage (one verdict per experiment) — rerunning
-- overwrites with a new judge slug + timestamp. The compare view
-- surfaces the tally above the variant grid.

ALTER TABLE "ai_experiment"
  ADD COLUMN "pairwiseVerdict" JSONB;
