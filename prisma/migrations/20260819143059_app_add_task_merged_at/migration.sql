-- `Task.mergedAt` — the merge instant on the row (§33-sweep t-115).
--
-- `Task` recorded WHO merged (`mergedByUserId`, §23) but never WHEN. The instant
-- survived only as the `task_merged` ProjectEvent's `createdAt`, which is absent
-- for every task imported by §19's cutover — so §33 t-100 had to read the journal
-- and invent an imported-history fallback. `Feature.shippedAt` and
-- `Phase.completedAt` already exist; this makes `Task` consistent with them.
--
-- NOTE: `prisma migrate dev` generated 46 further statements here and every one
-- was spurious — 11 hand-written satellite FK drops (six of them the ON DELETE
-- SET NULL constraints GDPR erasure depends on), the two pgvector HNSW indexes,
-- the GIN/tsvector search index, and a generated-column default. All stripped by
-- hand (the B13 footgun; see .context/database/prisma-unmodelled-objects.md).
-- This file must contain the ADD COLUMN and the backfill, and nothing else.

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN "mergedAt" TIMESTAMP(3);

-- Backfill from the journal, which is a legitimate one-time MIGRATION source even
-- though it is the wrong RUNTIME dependency (that is the whole point of this
-- column). MIN() because a task can carry more than one `task_merged` event — a
-- webhook re-delivery after a manual completion — and the first one is the truth.
--
-- Tasks with no event keep NULL: they were merged before the event stream existed
-- (§19 imported them), and inventing a timestamp would be worse than admitting we
-- do not know. NULL sorts as oldest, which is exactly what they are.
UPDATE "app_task" t
SET "mergedAt" = e."mergedAt"
FROM (
  SELECT "taskId", MIN("createdAt") AS "mergedAt"
  FROM "app_project_event"
  WHERE "kind" = 'task_merged' AND "taskId" IS NOT NULL
  GROUP BY "taskId"
) e
WHERE t."id" = e."taskId"
  AND t."status" = 'merged'
  AND t."mergedAt" IS NULL;
