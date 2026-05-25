-- Extend the account-deletion erasure policy to the evaluations feature
-- (merged from main). AiDataset = reusable asset -> SET NULL (userId made
-- nullable, creator de-attributed). AiEvaluationRun = a user's run history
-- -> CASCADE (results cascade from the run). Mirrors the erase-vs-retain
-- split in account_deletion_erasure_cascade.

-- DropForeignKey
ALTER TABLE "ai_dataset" DROP CONSTRAINT "ai_dataset_userId_fkey";

-- DropForeignKey
ALTER TABLE "ai_evaluation_run" DROP CONSTRAINT "ai_evaluation_run_userId_fkey";

-- AlterTable
ALTER TABLE "ai_dataset" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ai_dataset" ADD CONSTRAINT "ai_dataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_evaluation_run" ADD CONSTRAINT "ai_evaluation_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

