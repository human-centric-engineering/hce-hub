-- f-work-kinds §32 t-79 — separate provenance (what the work is) from accounting
-- (whether it counts toward a feature's completion).
--
-- B13 NOTE: `prisma migrate dev` generated ~15 further statements that are ALL
-- spurious and have been stripped by hand. It diffs the schema against a shadow
-- DB and emits DROPs for every object it cannot model:
--   * 11 × DROP CONSTRAINT on the hand-written `…UserId_fkey` FKs (app_feature,
--     app_focus_directive, app_idea, app_project, app_project_event,
--     app_project_member, app_task ×3, app_task_claim, app_user_github) — these
--     are deliberate hand-FKs carrying ON DELETE SET NULL/CASCADE for GDPR
--     erasure; `app_task_mergedByUserId_fkey` is additionally probed by
--     lib/app/db-drift.ts.
--   * 3 × DROP INDEX on the pgvector HNSW + tsvector GIN indexes.
--   * 1 × ALTER COLUMN "searchVector" DROP DEFAULT.
-- Re-authoring on these tables must always use --create-only so the DROPs are
-- reviewed before they are ever applied. See
-- .context/database/prisma-unmodelled-objects.md.

-- AlterEnum: `enhancement` — a task-sized improvement to existing work. Safe
-- inside the migration transaction (PG12+) because nothing here USES the new
-- value; the backfill below touches only app_feature.
ALTER TYPE "TaskKind" ADD VALUE 'enhancement';

-- AlterTable: the ship boundary. NULL ⇒ count every task, which is exactly
-- today's behaviour, so this column is behaviour-neutral at rest.
ALTER TABLE "app_feature" ADD COLUMN     "shippedAt" TIMESTAMP(3);

-- Backfill already-shipped features from their `feature_shipped` journal entry.
-- MIN(createdAt) because a feature could in principle have been shipped more
-- than once; the first ship is the boundary. Features with no such event keep
-- shippedAt NULL and therefore keep counting every task — degrading to today's
-- behaviour rather than to a fabricated timestamp.
UPDATE "app_feature" f
SET "shippedAt" = e."shippedAt"
FROM (
  SELECT "featureId", MIN("createdAt") AS "shippedAt"
  FROM "app_project_event"
  WHERE "kind" = 'feature_shipped' AND "featureId" IS NOT NULL
  GROUP BY "featureId"
) e
WHERE f."id" = e."featureId"
  AND f."status" = 'shipped'
  AND f."shippedAt" IS NULL;
