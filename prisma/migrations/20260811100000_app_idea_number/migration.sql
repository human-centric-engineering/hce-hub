-- f-idea-capture §22 t-63 — a stable, project-wide Idea.number (`#N`), mirroring
-- Feature.number / Project.featureCounter from f-status-model §20. It gives an
-- inbox idea a durable human handle ("promote #4") that survives drop/restore and
-- promotion. ADDITIVE only: two new columns plus a one-time backfill. Hand-authored
-- (`--create-only` discipline) so `prisma migrate dev` can't inject the B13 spurious
-- DROPs for the hand-written satellite FKs → "user" or the Sunrise pgvector/tsvector
-- indexes. Touches NO Sunrise object and NO prior app_* satellite FK.
-- (Re-verify the unmodelled objects survive after apply — db:drift-check.)

-- AlterTable
ALTER TABLE "app_project" ADD COLUMN "ideaCounter" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "app_idea" ADD COLUMN "number" INTEGER;

-- Backfill Idea.number: a per-project 1-indexed rank by capture order. The id
-- tiebreak makes ties deterministic; ideas captured one at a time rank exactly by
-- when they landed.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "app_idea"
)
UPDATE "app_idea" AS i
SET "number" = ranked.rn
FROM ranked
WHERE i."id" = ranked."id";

-- Seed each project's counter to its highest assigned idea number, so the next
-- capture_idea bump yields max+1 (no collision with a backfilled number).
UPDATE "app_project" AS p
SET "ideaCounter" = COALESCE(
  (SELECT MAX("number") FROM "app_idea" AS i WHERE i."projectId" = p."id"),
  0
);
