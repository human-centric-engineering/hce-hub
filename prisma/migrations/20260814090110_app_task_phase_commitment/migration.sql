-- f-work-kinds §32 t-80 — `Task.phaseId`, the commitment marker: the phase that
-- *chose* to do this work, when that differs from its feature's phase.
--
-- Ships INERT. The column is nullable and NULL means "inherit the feature's
-- phase", which is exactly today's behaviour — so nothing changes at rest and
-- there is no backfill. Mirrors `Feature.phaseId` (same ON DELETE SET NULL, same
-- index): deleting a phase releases the commitment rather than deleting the work.
--
-- B13 NOTE: `prisma migrate dev` generated 15 further statements, ALL spurious,
-- stripped by hand. It diffs against a shadow DB and emits DROPs for every object
-- it cannot model:
--   * 11 × DROP CONSTRAINT on the hand-written `…UserId_fkey` FKs (app_feature,
--     app_focus_directive, app_idea, app_project, app_project_event,
--     app_project_member, app_task ×3, app_task_claim, app_user_github) — these
--     carry the ON DELETE SET NULL/CASCADE policies GDPR erasure depends on, and
--     `app_task_mergedByUserId_fkey` is additionally probed by lib/app/db-drift.ts.
--   * 3 × DROP INDEX on the pgvector HNSW + tsvector GIN indexes.
--   * 1 × ALTER COLUMN "searchVector" DROP DEFAULT.
-- Always author migrations on these tables with --create-only so the DROPs are
-- reviewed before they are ever applied. See
-- .context/database/prisma-unmodelled-objects.md.

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN     "phaseId" TEXT;

-- CreateIndex
CREATE INDEX "app_task_phaseId_idx" ON "app_task"("phaseId");

-- AddForeignKey
ALTER TABLE "app_task" ADD CONSTRAINT "app_task_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "app_phase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
