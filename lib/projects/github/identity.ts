/**
 * GitHub identity ↔ Hub user mapping (f-github-identity §23 t-73).
 *
 * The satellite service behind the `app_user_github` table: a Hub user links a
 * verified GitHub identity (via the OAuth *linking* flow, t-2) so that GitHub
 * activity can be attributed to them. Two consumers read through
 * {@link resolveHubUserByGithubId}: `merged_by` attribution in f-github-sync's
 * reconcile (t-4), and future Sunrise-project issue/PR authorship (§27).
 *
 * The identity is written from a verified OAuth round-trip — never a self-typed
 * login — so `githubUserId` (GitHub's immutable numeric id) is trustworthy and is
 * the **only** match key for attribution. The token used to fetch it is
 * discarded, not stored.
 *
 * @see prisma/schema/app.prisma — model `UserGithubIdentity` (@@map app_user_github)
 * @see .context/app/github-identity.md
 */
import { Prisma, type UserGithubIdentity } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { ConflictError } from '@/lib/api/errors';

/** The verified GitHub identity fields, from the OAuth `/user` response. */
export interface GithubIdentityInput {
  /** GitHub's immutable numeric user id, as a string. */
  githubUserId: string;
  /** The current GitHub username (login). */
  githubLogin: string;
  /** Avatar URL, if GitHub returned one. */
  avatarUrl?: string | null;
}

/** The caller's linked GitHub identity, or `null` if they have not connected one. */
export function getGithubIdentity(userId: string): Promise<UserGithubIdentity | null> {
  return prisma.userGithubIdentity.findUnique({ where: { userId } });
}

/**
 * Link or refresh a user's GitHub identity — idempotent by `userId` (one per
 * user). A re-link updates the login/avatar (a GitHub username can change), so a
 * connect after a rename keeps the same row. The unique `githubUserId` /
 * `githubLogin` constraints reject linking a GitHub account already claimed by a
 * different Hub user (the caller — t-2 — surfaces that as a clean error).
 */
export async function upsertGithubIdentity(
  userId: string,
  input: GithubIdentityInput
): Promise<UserGithubIdentity> {
  const fields = {
    githubUserId: input.githubUserId,
    githubLogin: input.githubLogin,
    avatarUrl: input.avatarUrl ?? null,
  };
  try {
    return await prisma.userGithubIdentity.upsert({
      where: { userId },
      create: { userId, ...fields },
      update: fields,
    });
  } catch (err) {
    // A unique-constraint hit (`githubUserId` / `githubLogin`) means this GitHub
    // account is already linked to a *different* Hub user. Surface it as a domain
    // conflict, not a raw Prisma 500, so every caller gets a clean error — not
    // only the t-2 OAuth callback.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('This GitHub account is already linked to another user.');
    }
    throw err;
  }
}

/** Remove a user's GitHub link. Idempotent — a no-op if they have none. */
export async function disconnectGithubIdentity(userId: string): Promise<void> {
  await prisma.userGithubIdentity.deleteMany({ where: { userId } });
}

/**
 * Resolve a GitHub account to the Hub user who linked it, by GitHub's **immutable
 * numeric id** — or `null` if it is not linked to any Hub user.
 *
 * **Id only, by design.** A GitHub `login` is mutable and recyclable: a user can
 * rename, freeing the old username for someone else to claim. Matching on a login
 * would therefore resolve a stale username to the wrong Hub user — a silent
 * misattribution of "who merged this". The numeric id never changes, and every
 * source the Hub attributes from (the f-github-sync webhook `merged_by`, the
 * GitHub API) always carries it, so id-only loses nothing.
 */
export async function resolveHubUserByGithubId(githubUserId: string): Promise<string | null> {
  const row = await prisma.userGithubIdentity.findUnique({
    where: { githubUserId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}
