-- f-authoring-fidelity §21 t-d: split a feature's authored text into a short
-- plain `summary` (plan row / compact views) and the full markdown `description`
-- (feature page). Additive, nullable — hand-authored to avoid the `migrate dev`
-- shadow-diff emitting spurious DROPs of unmodelled objects (planning-retro B13).
ALTER TABLE "app_feature" ADD COLUMN "summary" TEXT;
