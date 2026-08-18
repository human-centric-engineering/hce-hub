-- f-phase-history §33 t-98 follow-up — recover the born-filed phase pointer.
--
-- DATA ONLY: no schema change. t-98 added `app_project_event.phaseId` and
-- deliberately shipped no backfill, on the grounds that historic phase changes
-- are unrecoverable. That is true of MOVES — nothing ever recorded them — but
-- wrong about BIRTHS: `create_feature` has always written the born-filed phase
-- into `metadata.phaseId`, so for those rows the fact is already on record and
-- this migration only copies it into the queryable column. Nothing is invented.
--
-- Without it a phase-scoped read (`list_events?phaseId=`, and the phase page in
-- idea #9) returns empty on a project whose features were all filed before
-- t-98 deployed — the data is there, just not where the query looks.
--
-- Scope, and its honest limit: `feature_created` only. `create_task` did not
-- record `phaseId` in its metadata until t-98 added it, so a task born committed
-- to a phase before that is genuinely unrecoverable and is left alone rather than
-- guessed at from its feature.
--
-- Guarded to what the live write path guarantees: the phase must still exist AND
-- belong to the same project, so this can never write a pointer that does not
-- resolve. Idempotent (`phaseId IS NULL` — a re-run matches nothing) and safe on
-- an empty table, so it is a no-op on a fresh database and on dev, which has no
-- such rows.
UPDATE "app_project_event" e
SET "phaseId" = e."metadata"->>'phaseId'
FROM "app_phase" p
WHERE e."kind" = 'feature_created'
  AND e."phaseId" IS NULL
  AND e."metadata" ? 'phaseId'
  AND p."id" = e."metadata"->>'phaseId'
  AND p."projectId" = e."projectId";
