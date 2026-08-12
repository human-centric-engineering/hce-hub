# Seeding a dev DB (new devs)

The Hub is its own **system of record** — its live data (the `hce-hub` project, its
features/tasks/journal, orchestration config) lives in the database, not in seeds. So a
new dev working on the Hub needs that data, not a fresh empty DB.

The old per-project `import-plan` / `app:project:import` path was retired in **t-65**
(f-selfhost-cutover) once the cutover was done and the synthetic project id was replaced
with a real cuid — see that PR / the git history for the transfer/cutover tooling. The
future is **whole-DB**, not project-by-project (it's also how the eventual move to
AWS/a VM will work), so onboarding is a database restore:

1. Get a dump of a reference DB — a **shared dev/staging** DB, or a **sanitized** export
   of prod. **Do not copy a raw prod dump onto a laptop:** it carries `user`/`session`
   rows with real names, emails, and live session tokens (this repo's whole GDPR posture
   — `eraseUser`/`exportUserData`, the privacy rules in `CLAUDE.md` — assumes that data
   stays server-side). Sanitize (scrub/rotate the `user` + `session` tables) or restore
   from a non-prod reference DB, never a bare `pg_dump` of production.
2. Restore it into your local Postgres and point `.env.local`'s `DATABASE_URL` at it.
3. `npm run db:migrate:status` to confirm migrations are in sync, then `npm run dev`.

`db:reset` / `db:seed` still set up the **platform** schema + seeds (auth, orchestration
capabilities, etc.); they deliberately do **not** recreate the Hub's own project — that
comes from the restore. GDPR subject-export/erasure (`lib/privacy`, the `smoke:export` /
`smoke:erasure` scripts) are unrelated and unaffected by the retirement.
