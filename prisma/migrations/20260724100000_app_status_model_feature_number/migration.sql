-- f-status-model §20 t-37 — a stable, project-wide Feature.number (mirrors
-- Task.number / Project.taskCounter from f-refs). ADDITIVE only: two new columns
-- plus a one-time backfill of existing rows. Hand-authored (`--create-only`
-- discipline) so `prisma migrate dev` can't inject the B13 spurious DROPs for the
-- hand-written satellite FKs → "user" or the Sunrise pgvector/tsvector indexes.
-- Touches NO Sunrise object and NO prior app_* satellite FK.
-- (Re-verify the unmodelled objects survive after apply — db:drift-check.)

-- AlterTable
ALTER TABLE "app_project" ADD COLUMN "featureCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "app_feature" ADD COLUMN "number" INTEGER;

-- Backfill Feature.number: a per-project 1-indexed rank by creation order — the
-- stable ordinal a feature keeps for life (= its plan.md §N). `id` breaks any
-- createdAt tie so the backfill is deterministic.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "app_feature"
)
UPDATE "app_feature" AS f
SET "number" = ranked.rn
FROM ranked
WHERE f."id" = ranked."id";

-- Seed each project's counter to its highest assigned number, so the next
-- create_feature bump yields max+1 (no collision with a backfilled number).
UPDATE "app_project" AS p
SET "featureCounter" = COALESCE(
  (SELECT MAX("number") FROM "app_feature" AS f WHERE f."projectId" = p."id"),
  0
);
