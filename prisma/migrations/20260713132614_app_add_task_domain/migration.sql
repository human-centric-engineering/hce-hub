-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('backlog', 'available', 'claimed', 'in_pr', 'merged');

-- NOTE (f-data-model t-2): `prisma migrate dev` generated EIGHT spurious
-- statements here, all stripped by hand — this migration only ADDS app_task*
-- tables and touches no Sunrise object and no prior app_* FK.
--
--   (a) DROP CONSTRAINT for the THREE t-1 satellite FKs → "user"
--       (app_project_leadUserId_fkey, app_project_member_userId_fkey,
--        app_feature_ownerUserId_fkey). Prisma has no `@relation` for these
--       hand-written FKs (CUSTOMIZATION §5), so the shadow-DB diff treats them
--       as extra objects and emits DROPs. Applying them would destroy the t-1
--       GDPR erasure mechanism — never let this through. This is precisely what
--       the drift probes in lib/app/db-drift.ts exist to catch (planning-retro
--       B11); had this run without --create-only it would have dropped them.
--   (b) DROP INDEX for the pgvector HNSW indexes (idx_knowledge_embedding,
--       idx_message_embedding) + the tsvector GIN index
--       (idx_ai_knowledge_chunk_search_vector), and a DROP DEFAULT on the
--       generated ai_knowledge_chunk.searchVector column — the B13 footgun.
--       These are Sunrise's Prisma-unmodelled RAG infrastructure and must NOT
--       be touched (drift-probed in Sunrise's own A-series).

-- CreateTable
CREATE TABLE "app_task" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'backlog',
    "filesScope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "claimedByUserId" TEXT,
    "prUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_task_dependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnTaskId" TEXT NOT NULL,

    CONSTRAINT "app_task_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_task_claim" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "app_task_claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_task_featureId_idx" ON "app_task"("featureId");

-- CreateIndex
CREATE INDEX "app_task_claimedByUserId_idx" ON "app_task"("claimedByUserId");

-- CreateIndex
CREATE INDEX "app_task_dependency_dependsOnTaskId_idx" ON "app_task_dependency"("dependsOnTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "app_task_dependency_taskId_dependsOnTaskId_key" ON "app_task_dependency"("taskId", "dependsOnTaskId");

-- CreateIndex
CREATE INDEX "app_task_claim_taskId_idx" ON "app_task_claim"("taskId");

-- CreateIndex
CREATE INDEX "app_task_claim_userId_idx" ON "app_task_claim"("userId");

-- AddForeignKey
ALTER TABLE "app_task" ADD CONSTRAINT "app_task_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "app_feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_task_dependency" ADD CONSTRAINT "app_task_dependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "app_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_task_dependency" ADD CONSTRAINT "app_task_dependency_dependsOnTaskId_fkey" FOREIGN KEY ("dependsOnTaskId") REFERENCES "app_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_task_claim" ADD CONSTRAINT "app_task_claim_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "app_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written satellite FKs → core "user" table (@@map name "user"). Prisma has
-- no `@relation` for these (that needs a field ON User — CUSTOMIZATION §5), so
-- they live here and are drift-probed in lib/app/db-drift.ts. ON DELETE fires
-- during eraseUser()'s tx.user.delete(), so these ARE the GDPR erasure mechanism:
--   - SET NULL  → retain the shared work (the task), drop the claimant reference
--   - CASCADE   → the row IS the user's participation (a claim), remove it
ALTER TABLE "app_task" ADD CONSTRAINT "app_task_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_task_claim" ADD CONSTRAINT "app_task_claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
