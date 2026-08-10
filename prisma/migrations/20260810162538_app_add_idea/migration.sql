-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('open', 'promoted', 'dropped');

-- CreateEnum
CREATE TYPE "IdeaOutcome" AS ENUM ('feature', 'task', 'phase', 'bug');

-- CreateTable
CREATE TABLE "app_idea" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "IdeaStatus" NOT NULL DEFAULT 'open',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedKind" "IdeaOutcome",
    "promotedRefId" TEXT,
    "triagedAt" TIMESTAMP(3),

    CONSTRAINT "app_idea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_idea_projectId_status_idx" ON "app_idea"("projectId", "status");

-- AddForeignKey
ALTER TABLE "app_idea" ADD CONSTRAINT "app_idea_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: createdByUserId → "user", ON DELETE SET NULL.
-- Hand-FK: Prisma can't model a relation to better-auth's `user`, so this
-- constraint is added by hand — it is what makes eraseUser() de-attribute a
-- captured idea (SetNull) while RETAINING the idea, exactly like
-- app_feature.ownerUserId. See lib/privacy/erase-user.ts.
ALTER TABLE "app_idea" ADD CONSTRAINT "app_idea_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
