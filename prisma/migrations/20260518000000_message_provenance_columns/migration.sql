-- Message-level provenance columns on ai_message.
--
-- Mirrors the supervisor-on-execution pattern (5 scalars + 1 JSON bundle on
-- ai_workflow_execution). Scalars are indexed for query: "show me every
-- message produced by agent vN", "...routed to model X", "...fired by
-- workflow execution Y". The `provenance` JSON column holds the structured
-- evidence bundle — citations (with documentVersion + contentHash),
-- workflow step sources snapshotted at message-creation time, and
-- capability calls.
--
-- workflowExecutionId is NOT a foreign key — executions can be pruned
-- independently of messages. The column is a snapshot reference, same
-- treatment as modelId (a string snapshot, not an FK to ai_model).
--
-- Non-destructive: pre-existing rows get NULL on all columns. The chat
-- handler populates them at message-creation time going forward.
--
-- Reference: .context/orchestration/provenance.md (message-level chapter).

ALTER TABLE "ai_message"
  ADD COLUMN IF NOT EXISTS "agentVersionId"      TEXT,
  ADD COLUMN IF NOT EXISTS "workflowExecutionId" TEXT,
  ADD COLUMN IF NOT EXISTS "workflowVersionId"   TEXT,
  ADD COLUMN IF NOT EXISTS "modelId"             TEXT,
  ADD COLUMN IF NOT EXISTS "providerSlug"        TEXT,
  ADD COLUMN IF NOT EXISTS "provenance"          JSONB;

CREATE INDEX IF NOT EXISTS "ai_message_agentVersionId_idx"
  ON "ai_message" ("agentVersionId");

CREATE INDEX IF NOT EXISTS "ai_message_workflowExecutionId_idx"
  ON "ai_message" ("workflowExecutionId");

CREATE INDEX IF NOT EXISTS "ai_message_modelId_idx"
  ON "ai_message" ("modelId");
