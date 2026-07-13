-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('planning', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('lead', 'member');

-- CreateEnum
CREATE TYPE "FeatureStatus" AS ENUM ('planning', 'in_flight', 'blocked', 'shipped');

-- NOTE (f-data-model t-1): `prisma migrate dev` generated four spurious
-- statements here — DROP INDEX for the pgvector HNSW indexes
-- (idx_knowledge_embedding, idx_message_embedding) + the tsvector GIN index
-- (idx_ai_knowledge_chunk_search_vector), and a DROP DEFAULT on the generated
-- ai_knowledge_chunk.searchVector column. Prisma can't model these raw-SQL
-- objects, so it thinks they should not exist and emits drops for them. They are
-- Sunrise's RAG search infrastructure and must NOT be touched — stripped by hand
-- per the standing migration-hygiene step (.context/app/planning/planning-retro
-- B13; drift-probed in Sunrise's own A-series). This migration only adds app_*
-- tables; it makes no change to any Sunrise object.

-- CreateTable
CREATE TABLE "app_project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostPlatform" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'planning',
    "repoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "leadUserId" TEXT,
    "knowledgeTagId" TEXT,
    "sidekickAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_project_member" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'member',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_project_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_feature" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerUserId" TEXT,
    "status" "FeatureStatus" NOT NULL DEFAULT 'planning',
    "helpWanted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_feature_dependency" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "dependsOnFeatureId" TEXT NOT NULL,

    CONSTRAINT "app_feature_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_project_leadUserId_idx" ON "app_project"("leadUserId");

-- CreateIndex
CREATE INDEX "app_project_member_userId_idx" ON "app_project_member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "app_project_member_projectId_userId_key" ON "app_project_member"("projectId", "userId");

-- CreateIndex
CREATE INDEX "app_feature_projectId_idx" ON "app_feature"("projectId");

-- CreateIndex
CREATE INDEX "app_feature_ownerUserId_idx" ON "app_feature"("ownerUserId");

-- CreateIndex
CREATE INDEX "app_feature_dependency_dependsOnFeatureId_idx" ON "app_feature_dependency"("dependsOnFeatureId");

-- CreateIndex
CREATE UNIQUE INDEX "app_feature_dependency_featureId_dependsOnFeatureId_key" ON "app_feature_dependency"("featureId", "dependsOnFeatureId");

-- AddForeignKey
ALTER TABLE "app_project_member" ADD CONSTRAINT "app_project_member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_feature" ADD CONSTRAINT "app_feature_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_feature_dependency" ADD CONSTRAINT "app_feature_dependency_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "app_feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_feature_dependency" ADD CONSTRAINT "app_feature_dependency_dependsOnFeatureId_fkey" FOREIGN KEY ("dependsOnFeatureId") REFERENCES "app_feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written satellite FKs → core "user" table (@@map name "user"). Prisma has
-- no `@relation` for these (that needs a field ON User — CUSTOMIZATION §5), so
-- they live here and are drift-probed in lib/app/db-drift.ts. ON DELETE fires
-- during eraseUser()'s tx.user.delete(), so these ARE the GDPR erasure mechanism:
--   - SET NULL  → retain the shared work (project/feature), drop the person
--   - CASCADE   → the row IS the user's participation (membership), remove it
ALTER TABLE "app_project" ADD CONSTRAINT "app_project_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_project_member" ADD CONSTRAINT "app_project_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_feature" ADD CONSTRAINT "app_feature_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
