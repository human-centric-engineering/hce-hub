-- NOTE (f-github-identity §23 t-74): drop the UNIQUE on app_user_github.githubLogin.
-- A GitHub login is mutable and recyclable (a user renames; someone else claims
-- the freed name), so it is NOT an identity key — githubUserId (still UNIQUE) is
-- the sole match key (see lib/projects/github/identity.ts). Keeping login UNIQUE
-- made a stale login collide with a legitimate NEW link, misreporting it as
-- "already linked to another user". Hand-authored (create-only equivalent):
-- `prisma migrate dev` would also emit the spurious hand-FK DROPs (B13/planning-
-- retro) for every `→ "user"` satellite FK — deliberately omitted here.

-- DropIndex
DROP INDEX "app_user_github_githubLogin_key";
