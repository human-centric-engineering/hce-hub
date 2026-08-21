-- The withdrawal instant (f-authoring-fidelity §21 t-123) + the journal kind
-- that records it.
--
-- HAND-STRIPPED (planning-retro B13). `prisma migrate dev` also emitted, and
-- applied, 11 `DROP CONSTRAINT` statements for the hand-written FKs to "user"
-- and 3 `DROP INDEX` statements for the tsvector GIN + two pgvector HNSW
-- indexes — none of which Prisma can model, so its diff reads them as objects
-- that should not exist. It then failed on `ai_knowledge_chunk.searchVector`
-- (a GENERATED column), which is the only reason the damage stopped there.
-- Those 14 statements are removed; the two below are the actual change.
-- See .context/database/prisma-unmodelled-objects.md.

-- AlterEnum
-- `IF NOT EXISTS` because ADD VALUE is NOT rolled back when a later statement
-- in the same migration fails — which is exactly what happened here. Without
-- the guard the retry dies on "already exists" and the migration can never
-- recover. No-op difference on a fresh database.
ALTER TYPE "ProjectEventKind" ADD VALUE IF NOT EXISTS 'task_withdrawn';

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN     "withdrawnAt" TIMESTAMP(3);
