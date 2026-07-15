-- NOTE (f-refs t-1): `prisma migrate diff` generated SIX spurious statements
-- here (the B13 footgun), all stripped by hand. This migration ONLY adds the
-- f-refs columns (app_feature.slug, app_task.number, app_project.taskCounter)
-- and the per-project slug unique index. It touches NO Sunrise object and NO
-- prior app_* satellite FK.
--
-- Stripped (applying them would destroy objects Prisma can't model — CUSTOMIZATION §5):
--   DROP CONSTRAINT app_task_claimedByUserId_fkey, app_task_claim_userId_fkey
--     (hand-written satellite FKs → "user"; no Prisma @relation → diffed as extra)
--   DROP INDEX idx_ai_knowledge_chunk_search_vector (Sunrise tsvector GIN search)
--   DROP INDEX idx_knowledge_embedding, idx_message_embedding (Sunrise pgvector HNSW)
--   ALTER ai_knowledge_chunk."searchVector" DROP DEFAULT (generated tsvector column)
-- (Re-verify these survive after apply — db:drift-check.)

-- AlterTable
ALTER TABLE "app_feature" ADD COLUMN "slug" TEXT;

-- AlterTable
ALTER TABLE "app_project" ADD COLUMN "taskCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN "number" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "app_feature_projectId_slug_key" ON "app_feature"("projectId", "slug");
