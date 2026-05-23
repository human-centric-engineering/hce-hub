-- Add optional entity-scoping arrays so a single subscription can be limited to
-- specific agents and/or workflows. Empty array means "no constraint on this
-- dimension". The dispatcher applies dimension-specific filtering — see
-- lib/orchestration/webhooks/event-entity-keys.ts.

ALTER TABLE "ai_webhook_subscription"
  ADD COLUMN "agentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "workflowIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
