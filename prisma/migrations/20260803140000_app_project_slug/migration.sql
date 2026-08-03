-- f-selfhost-cutover §19 t-3 — a shareable, durable human URL key for projects
-- (`/projects/hce-hub` instead of `/projects/<cuid>`). ADDITIVE only: a nullable
-- column + a one-time name-derived backfill + a global unique index. Hand-authored
-- (`--create-only` discipline) so `prisma migrate dev` can't inject the B13
-- spurious DROPs for the hand-written satellite FKs → "user" or the Sunrise
-- pgvector/tsvector indexes. Touches NO Sunrise object and NO app_* satellite FK.
-- (Re-verify the unmodelled objects survive after apply — db:drift-check.)

-- AlterTable
ALTER TABLE "app_project" ADD COLUMN "slug" TEXT;

-- Backfill: derive a slug from the project name (lowercase, non-alphanumeric runs
-- → single hyphen, trimmed). A name with no alphanumerics collapses to '' → left
-- NULL (that project keeps cuid-only URLs). Runs BEFORE the unique index so a
-- (near-impossible, distinct-named) collision would surface at index creation.
UPDATE "app_project"
SET "slug" = NULLIF(
  trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g')),
  ''
)
WHERE "slug" IS NULL;

-- CreateIndex — global unique (projects are top-level, unlike per-project feature slugs).
CREATE UNIQUE INDEX "app_project_slug_key" ON "app_project"("slug");
