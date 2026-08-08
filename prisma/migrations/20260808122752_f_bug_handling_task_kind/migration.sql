-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('feature_work', 'bug');

-- AlterEnum
ALTER TYPE "ProjectEventKind" ADD VALUE 'bug_reported';

-- AlterTable
ALTER TABLE "app_task" ADD COLUMN     "kind" "TaskKind" NOT NULL DEFAULT 'feature_work';
