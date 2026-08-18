-- f-phase-history §33 t-98 — make a phase change append rather than overwrite.
--
-- f-phases §22 shipped its write surface ahead of its read surface: phase edits
-- and feature/task phase assignments were audit-logged (`logAdminAction`) but
-- never journalled, so moving a feature between phases genuinely rewrote history
-- and a phase's own evolution (renamed, re-scoped, parked) went unrecorded.
--
-- B13 NOTE: `prisma migrate dev --create-only` generated 16 further statements
-- that are ALL spurious and have been stripped by hand. It diffs the schema
-- against a shadow DB and emits DROPs for every object it cannot model:
--   * 12 × DROP CONSTRAINT on the hand-written `…UserId_fkey` FKs (app_feature,
--     app_focus_directive, app_idea, app_project, app_project_event,
--     app_project_member, app_task ×3, app_task_claim, app_user_github) — these
--     are deliberate hand-FKs carrying ON DELETE SET NULL/CASCADE for GDPR
--     erasure; `app_task_mergedByUserId_fkey` is additionally probed by
--     lib/app/db-drift.ts.
--   * 3 × DROP INDEX on the pgvector HNSW + tsvector GIN indexes.
--   * 1 × ALTER COLUMN "searchVector" DROP DEFAULT.
-- Re-authoring on these tables must always use --create-only so the DROPs are
-- reviewed before they are ever applied. See
-- .context/database/prisma-unmodelled-objects.md.

-- AlterEnum: three phase kinds, not five. `phase_updated` names the changed
-- fields in `metadata.fields`, and ONE membership kind covers feature-moves and
-- task-moves via `metadata.subject` — the `task_assigned` precedent (one kind,
-- two moves, read the metadata) rather than an enum value per variant.
-- `reorderPhases` deliberately emits nothing: ordering is presentation, not
-- history, and one drag would emit an event per phase.
--
-- Safe inside the migration transaction (PG12+) because nothing here USES the
-- new values — there is no backfill. Historic phase changes predate the stream
-- and are genuinely unrecoverable (that is the gap this closes, not one it can
-- retrofit); inventing events for them would fabricate history.
ALTER TYPE "ProjectEventKind" ADD VALUE 'phase_created';
ALTER TYPE "ProjectEventKind" ADD VALUE 'phase_updated';
ALTER TYPE "ProjectEventKind" ADD VALUE 'phase_membership_changed';

-- AlterTable: the third soft scope pointer, alongside featureId / taskId. No FK
-- by design — history outlives the phase it describes. On a membership change it
-- carries the phase whose membership changed in the way worth recording: the
-- DESTINATION on a move or a file, the ORIGIN on an unfile (metadata always
-- carries both ends as fromPhaseId / toPhaseId). Nullable, so every pre-existing
-- row stays valid and this column is behaviour-neutral at rest.
ALTER TABLE "app_project_event" ADD COLUMN     "phaseId" TEXT;

-- CreateIndex: the phase-scoped journal read (`list_events` / GET ?phaseId=).
CREATE INDEX "app_project_event_phaseId_idx" ON "app_project_event"("phaseId");
