-- Phase.summary — a short plain one-liner for the Plan band, mirroring
-- Feature.summary (§33-sweep t-104). Nullable, so every existing phase is
-- untouched and the band falls back to `description` exactly as before.

-- STRIPPED BY HAND. `prisma migrate dev` generated 16 statements for this one
-- column: 11 `DROP CONSTRAINT` on the hand-written user FKs, 3 `DROP INDEX` on
-- the pgvector/tsvector indexes, and a `DROP DEFAULT` on `searchVector` — none of
-- which this change asks for. They appear because Prisma diffs the schema against
-- a shadow DB and silently emits a DROP for every object it cannot represent
-- (see .context/database/prisma-unmodelled-objects.md). Authored with
-- `--create-only` for exactly this reason; `npm run db:drift-check` confirms the
-- dropped-then-restored objects are still present after applying.
ALTER TABLE "app_phase" ADD COLUMN "summary" TEXT;
