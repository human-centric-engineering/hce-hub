-- AlterTable
ALTER TABLE "ai_agent" ADD COLUMN     "knowledgeRetrievalMode" TEXT NOT NULL DEFAULT 'model',
ADD COLUMN     "knowledgeTriggerKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
