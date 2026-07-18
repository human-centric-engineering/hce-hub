-- NOTE (f-feature-planning §18 t-1): `prisma migrate dev` generated ELEVEN
-- spurious statements here, all stripped by hand — this migration only ADDS the
-- feature-planning columns/table and touches no Sunrise object and no prior
-- app_* FK.
--
--   (a) DROP CONSTRAINT for the SEVEN satellite FKs → "user"
--       (app_feature_ownerUserId_fkey, app_focus_directive_declaredByUserId_fkey,
--        app_project_leadUserId_fkey, app_project_event_actorUserId_fkey,
--        app_project_member_userId_fkey, app_task_claimedByUserId_fkey,
--        app_task_claim_userId_fkey). Prisma has no `@relation` for these
--        hand-written FKs (CUSTOMIZATION §5), so the shadow-DB diff treats them as
--        extra objects and emits DROPs. Applying them would destroy the GDPR
--        erasure mechanism — never let this through (drift-probed in
--        lib/app/db-drift.ts; planning-retro B11 / B13).
--   (b) DROP INDEX for the pgvector HNSW indexes (idx_knowledge_embedding,
--       idx_message_embedding) + the tsvector GIN index
--       (idx_ai_knowledge_chunk_search_vector), and a DROP DEFAULT on the
--       generated ai_knowledge_chunk.searchVector column — the B13 footgun.
--       Sunrise's Prisma-unmodelled RAG infrastructure; must NOT be touched.

-- CreateEnum
CREATE TYPE "FeaturePlanningStage" AS ENUM ('indicative', 'planned');

-- AlterTable
ALTER TABLE "app_feature" ADD COLUMN     "doneWhen" TEXT,
ADD COLUMN     "planningStage" "FeaturePlanningStage" NOT NULL DEFAULT 'indicative',
ADD COLUMN     "references" JSONB;

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN     "assigneeUserId" TEXT,
ADD COLUMN     "doneWhen" TEXT;

-- CreateTable
CREATE TABLE "app_indicative_task" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "app_indicative_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_indicative_task_featureId_idx" ON "app_indicative_task"("featureId");

-- CreateIndex
CREATE INDEX "app_task_assigneeUserId_idx" ON "app_task"("assigneeUserId");

-- AddForeignKey
ALTER TABLE "app_indicative_task" ADD CONSTRAINT "app_indicative_task_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "app_feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written satellite FK → core "user" table (@@map name "user"). Prisma has
-- no `@relation` for this (that needs a field ON User — CUSTOMIZATION §5), so it
-- lives here and is drift-probed in lib/app/db-drift.ts. ON DELETE SET NULL fires
-- during eraseUser()'s tx.user.delete(): a Task is retained shared work (the row
-- stays), so the assignee reference is nulled, not the row — exactly like
-- claimedByUserId. "This is yours to do", distinct from the pull-claim.
ALTER TABLE "app_task" ADD CONSTRAINT "app_task_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
