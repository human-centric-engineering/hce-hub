-- CreateEnum
CREATE TYPE "SprintStatus" AS ENUM ('upcoming', 'active', 'complete');

-- CreateEnum
CREATE TYPE "FocusDirectiveStatus" AS ENUM ('active', 'expired', 'superseded');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('upcoming', 'active', 'complete', 'parked');

-- NOTE (f-data-model t-3): `prisma migrate dev` generated NINE spurious
-- statements here, all stripped by hand — this migration only ADDS the futures
-- scaffolding (app_sprint / app_focus_directive / app_phase + a nullable
-- app_feature.phaseId) and touches no Sunrise object and no prior app_* FK.
--
--   (a) DROP CONSTRAINT for all FIVE prior satellite FKs → "user"
--       (app_project_leadUserId_fkey, app_project_member_userId_fkey,
--        app_feature_ownerUserId_fkey [t-1]; app_task_claimedByUserId_fkey,
--        app_task_claim_userId_fkey [t-2]). Prisma has no `@relation` for these
--       hand-written FKs (CUSTOMIZATION §5), so the shadow-DB diff treats them
--       as extra objects and emits DROPs. Applying them would destroy the GDPR
--       erasure mechanism — never let this through; the drift probes in
--       lib/app/db-drift.ts are exactly the guard (planning-retro B11).
--   (b) DROP INDEX for the pgvector HNSW indexes (idx_knowledge_embedding,
--       idx_message_embedding) + the tsvector GIN index
--       (idx_ai_knowledge_chunk_search_vector), and a DROP DEFAULT on the
--       generated ai_knowledge_chunk.searchVector column — the B13 footgun.
--       Sunrise's Prisma-unmodelled RAG infrastructure; must NOT be touched.

-- AlterTable
ALTER TABLE "app_feature" ADD COLUMN     "phaseId" TEXT;

-- CreateTable
CREATE TABLE "app_sprint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SprintStatus" NOT NULL DEFAULT 'upcoming',
    "planMarkdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_focus_directive" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sprintId" TEXT,
    "declaredByUserId" TEXT,
    "intent" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3),
    "reason" TEXT,
    "status" "FocusDirectiveStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "app_focus_directive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_phase" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PhaseStatus" NOT NULL DEFAULT 'upcoming',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_phase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_focus_directive_projectId_idx" ON "app_focus_directive"("projectId");

-- CreateIndex
CREATE INDEX "app_focus_directive_sprintId_idx" ON "app_focus_directive"("sprintId");

-- CreateIndex
CREATE INDEX "app_focus_directive_declaredByUserId_idx" ON "app_focus_directive"("declaredByUserId");

-- CreateIndex
CREATE INDEX "app_phase_projectId_idx" ON "app_phase"("projectId");

-- CreateIndex
CREATE INDEX "app_feature_phaseId_idx" ON "app_feature"("phaseId");

-- AddForeignKey
ALTER TABLE "app_feature" ADD CONSTRAINT "app_feature_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "app_phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_focus_directive" ADD CONSTRAINT "app_focus_directive_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_focus_directive" ADD CONSTRAINT "app_focus_directive_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "app_sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_phase" ADD CONSTRAINT "app_phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written satellite FK → core "user" table (@@map name "user"). Prisma has
-- no `@relation` for this (that needs a field ON User — CUSTOMIZATION §5), so it
-- lives here and is drift-probed in lib/app/db-drift.ts. ON DELETE fires during
-- eraseUser()'s tx.user.delete(): SET NULL retains the directive (shared work)
-- while dropping the declarer reference. (The only Hub→user edge in t-3 — Sprint
-- is user-agnostic; every other new edge is intra-Hub, handled above.)
ALTER TABLE "app_focus_directive" ADD CONSTRAINT "app_focus_directive_declaredByUserId_fkey" FOREIGN KEY ("declaredByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
