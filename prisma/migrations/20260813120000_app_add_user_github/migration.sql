-- NOTE (f-github-identity §23 t-73): hand-authored (create-only equivalent).
-- `prisma migrate dev` would have generated spurious statements alongside the
-- one table this migration ADDS — all deliberately omitted here:
--
--   (a) DROP CONSTRAINT for the NINE satellite FKs → "user"
--       (app_project_leadUserId_fkey, app_project_member_userId_fkey,
--        app_feature_ownerUserId_fkey, app_task_claimedByUserId_fkey,
--        app_task_assigneeUserId_fkey, app_task_claim_userId_fkey,
--        app_focus_directive_declaredByUserId_fkey,
--        app_project_event_actorUserId_fkey, app_idea_createdByUserId_fkey).
--       Prisma has no `@relation` for these hand-written FKs (CUSTOMIZATION §5),
--       so the shadow-DB diff treats them as extra objects and emits DROPs.
--       Applying them would destroy the GDPR erasure mechanism — never let this
--       through (drift-probed in lib/app/db-drift.ts; planning-retro B11/B13).
--   (b) DROP INDEX for the pgvector HNSW indexes + the tsvector GIN index, and a
--       DROP DEFAULT on the generated ai_knowledge_chunk.searchVector column —
--       Sunrise's Prisma-unmodelled RAG infrastructure; must NOT be touched.

-- CreateTable
CREATE TABLE "app_user_github" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubUserId" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_github_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_github_userId_key" ON "app_user_github"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_github_githubUserId_key" ON "app_user_github"("githubUserId");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_github_githubLogin_key" ON "app_user_github"("githubLogin");

-- Hand-written satellite FK → core "user" table (@@map name "user"). Prisma has
-- no `@relation` for this (that needs a field ON User — CUSTOMIZATION §5), so it
-- lives here and is drift-probed in lib/app/db-drift.ts. ON DELETE CASCADE fires
-- during eraseUser()'s tx.user.delete(): the GitHub link is the user's personal
-- data, so the row is deleted with them (proved by scripts/app/smoke/erasure.ts).
ALTER TABLE "app_user_github" ADD CONSTRAINT "app_user_github_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
