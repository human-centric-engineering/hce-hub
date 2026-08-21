-- HAND-STRIPPED (planning-retro B13). `prisma migrate dev` diffs the schema against a
-- shadow DB and emits a DROP for every object it cannot model, so the generated file
-- also carried 15 destructive statements that have nothing to do with this change:
--
--   * 11 `DROP CONSTRAINT` — every hand-written satellite FK to core `"user"`
--     (app_feature.ownerUserId, app_idea.createdByUserId, app_task.assigneeUserId /
--     claimedByUserId / mergedByUserId, app_task_claim.userId, app_project.leadUserId,
--     app_project_member.userId, app_project_event.actorUserId,
--     app_focus_directive.declaredByUserId, app_user_github.userId). Their ON DELETE
--     actions ARE the GDPR erasure mechanism, so dropping them would silently break
--     Art. 17 while every test stayed green.
--   * 3 `DROP INDEX` — the tsvector GIN index and the two pgvector HNSW indexes.
--   * 1 `ALTER COLUMN "searchVector" DROP DEFAULT` — the GENERATED column.
--
-- Generated with `--create-only` precisely so those were reviewed before being applied;
-- `db:drift-check` covers all four families. See .context/database/prisma-unmodelled-objects.md.
--
-- What remains is additive only. Every column carries DEFAULT CURRENT_TIMESTAMP because
-- the Prisma field pairs `@default(now())` with `@updatedAt` — without that default,
-- `ADD COLUMN … NOT NULL` fails on any table that already has rows, which is all of them.

-- AlterTable
ALTER TABLE "app_project" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_idea" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_project_member" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_feature" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_feature_dependency" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_indicative_task" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_task_dependency" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_task_claim" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_focus_directive" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "app_phase" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
