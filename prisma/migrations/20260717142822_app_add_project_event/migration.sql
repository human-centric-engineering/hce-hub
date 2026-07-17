-- CreateEnum
CREATE TYPE "ProjectEventKind" AS ENUM ('feature_created', 'feature_claimed', 'feature_planned', 'feature_shipped', 'feature_blocked', 'feature_unblocked', 'task_created', 'task_claimed', 'task_pr_linked', 'task_merged', 'help_wanted', 'member_added', 'decision', 'note');

-- NOTE (f-journal §17 t-1): `prisma migrate dev` generated TEN spurious
-- statements here, all stripped by hand — this migration only ADDS the
-- app_project_event table and touches no Sunrise object and no prior app_* FK.
--
--   (a) DROP CONSTRAINT for the SIX satellite FKs → "user"
--       (app_feature_ownerUserId_fkey, app_focus_directive_declaredByUserId_fkey,
--        app_project_leadUserId_fkey, app_project_member_userId_fkey,
--        app_task_claimedByUserId_fkey, app_task_claim_userId_fkey). Prisma has no
--        `@relation` for these hand-written FKs (CUSTOMIZATION §5), so the
--        shadow-DB diff treats them as extra objects and emits DROPs. Applying
--        them would destroy the GDPR erasure mechanism — never let this through
--        (drift-probed in lib/app/db-drift.ts; planning-retro B11).
--   (b) DROP INDEX for the pgvector HNSW indexes (idx_knowledge_embedding,
--       idx_message_embedding) + the tsvector GIN index
--       (idx_ai_knowledge_chunk_search_vector), and a DROP DEFAULT on the
--       generated ai_knowledge_chunk.searchVector column — the B13 footgun.
--       Sunrise's Prisma-unmodelled RAG infrastructure; must NOT be touched.

-- CreateTable
CREATE TABLE "app_project_event" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "featureId" TEXT,
    "taskId" TEXT,
    "kind" "ProjectEventKind" NOT NULL,
    "actorUserId" TEXT,
    "actorAgentId" TEXT,
    "title" TEXT,
    "body" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_project_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_project_event_projectId_createdAt_idx" ON "app_project_event"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "app_project_event_featureId_idx" ON "app_project_event"("featureId");

-- CreateIndex
CREATE INDEX "app_project_event_taskId_idx" ON "app_project_event"("taskId");

-- AddForeignKey
ALTER TABLE "app_project_event" ADD CONSTRAINT "app_project_event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written satellite FK → core "user" table (@@map name "user"). Prisma has
-- no `@relation` for this (that needs a field ON User — CUSTOMIZATION §5), so it
-- lives here and is drift-probed in lib/app/db-drift.ts. ON DELETE SET NULL fires
-- during eraseUser()'s tx.user.delete(): a ProjectEvent is retained shared
-- history (the record stays), so the actor reference is nulled, not the row.
ALTER TABLE "app_project_event" ADD CONSTRAINT "app_project_event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
