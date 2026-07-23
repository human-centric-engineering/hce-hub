-- Retype `app_task.status`: the `TaskStatus` enum collapses from
-- {backlog, available, claimed, in_pr, merged} to {claimed, active, merged}
-- (f-status-model §20 t-1). A task is now *born* `claimed` (you claim features,
-- not tasks), is `active` while worked, `merged` when done; `blocked` is a
-- derived overlay, never stored.
--
-- HAND-AUTHORED, not a plain `prisma migrate` diff: a Postgres enum value-set
-- change with values removed must retype the column via a `USING` data map, or
-- it fails on any existing row holding a dropped value. Map:
--   merged             → merged
--   in_pr              → active
--   backlog|available|claimed → claimed
-- No unmodelled objects (pgvector/GIN/partial-unique/CHECK) are touched, so
-- there is nothing for `db:drift-check` to lose here.

-- Drop the column default so the column can be retyped.
ALTER TABLE "app_task" ALTER COLUMN "status" DROP DEFAULT;

-- The new, narrower enum type.
CREATE TYPE "TaskStatus_new" AS ENUM ('claimed', 'active', 'merged');

-- Retype the column, mapping every old value onto the new set.
ALTER TABLE "app_task"
  ALTER COLUMN "status" TYPE "TaskStatus_new"
  USING (
    CASE "status"::text
      WHEN 'merged' THEN 'merged'
      WHEN 'in_pr' THEN 'active'
      ELSE 'claimed'
    END::"TaskStatus_new"
  );

-- Retire the old type and rename the new one into its place.
DROP TYPE "TaskStatus";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";

-- Restore the default under the new model (born claimed).
ALTER TABLE "app_task" ALTER COLUMN "status" SET DEFAULT 'claimed';
