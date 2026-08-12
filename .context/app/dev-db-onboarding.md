# Seeding a dev DB (new devs)

The Hub is its own **system of record** — its live data (the `hce-hub` project, its
features/tasks/journal, orchestration config) lives in the database, not in seeds. So a
new dev working on the Hub needs that data, not a fresh empty DB.

The old per-project `import-plan` / `app:project:import` path was retired in **t-65**
(f-selfhost-cutover) once the cutover was done and the synthetic project id was replaced
with a real cuid — see that PR / the git history for the transfer/cutover tooling. The
future is **whole-DB**, not project-by-project (it's also how the eventual move to
AWS/a VM will work), so onboarding is a database restore:

1. Take a dump of a reference DB (prod, or a shared dev/staging) — e.g. `pg_dump`, or
   Neon's branch/export. Prefer a **sanitized** dump (it carries `user`/`session` rows).
2. Restore it into your local Postgres and point `.env.local`'s `DATABASE_URL` at it.
3. `npm run db:migrate:status` to confirm migrations are in sync, then `npm run dev`.

`db:reset` / `db:seed` still set up the **platform** schema + seeds (auth, orchestration
capabilities, etc.); they deliberately do **not** recreate the Hub's own project — that
comes from the restore. GDPR subject-export/erasure (`lib/privacy`, the `smoke:export` /
`smoke:erasure` scripts) are unrelated and unaffected by the retirement.
