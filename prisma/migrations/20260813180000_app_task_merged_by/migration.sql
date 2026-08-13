-- NOTE (f-github-identity §23 t-76): add app_task.mergedByUserId — the GitHub
-- merger (`merged_by`) resolved to a Hub user, ADDITIVE and distinct from the
-- doer (`claimedByUserId`). Hand-authored (create-only equivalent); `prisma
-- migrate dev` would also emit the spurious hand-FK DROPs for every existing
-- `→ "user"` satellite FK (B13/planning-retro) — deliberately omitted here.

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN "mergedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "app_task_mergedByUserId_idx" ON "app_task"("mergedByUserId");

-- Hand-written satellite FK → core "user" table. ON DELETE SET NULL: the task is
-- retained shared work, so the merge attribution is nulled on erasure (the same
-- policy as claimedByUserId / assigneeUserId). Drift-probed in lib/app/db-drift.ts.
ALTER TABLE "app_task" ADD CONSTRAINT "app_task_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
