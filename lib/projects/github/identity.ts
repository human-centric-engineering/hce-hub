/**
 * GitHub identity ↔ Hub user mapping (f-github-identity §23 t-73).
 *
 * The satellite service behind the `app_user_github` table: a Hub user links a
 * verified GitHub identity (via the OAuth *linking* flow, t-2) so that GitHub
 * activity can be attributed to them. Two consumers read through
 * {@link resolveHubUserByGithub}: `merged_by` attribution in f-github-sync's
 * reconcile (t-4), and future Sunrise-project issue/PR authorship (§27).
 *
 * The identity is written from a verified OAuth round-trip — never a self-typed
 * login — so `githubUserId` (GitHub's immutable numeric id) is trustworthy and is
 * the primary match key. The token used to fetch it is discarded, not stored.
 *
 * @see prisma/schema/app.prisma — model `UserGithubIdentity` (@@map app_user_github)
 * @see .context/app/github-identity.md
 */
import type { UserGithubIdentity } from '@prisma/client';
import { prisma } from '@/lib/db/client';

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
export function upsertGithubIdentity(
  userId: string,
  input: GithubIdentityInput
): Promise<UserGithubIdentity> {
  const fields = {
    githubUserId: input.githubUserId,
    githubLogin: input.githubLogin,
    avatarUrl: input.avatarUrl ?? null,
  };
  return prisma.userGithubIdentity.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: fields,
  });
}

/** Remove a user's GitHub link. Idempotent — a no-op if they have none. */
export async function disconnectGithubIdentity(userId: string): Promise<void> {
  await prisma.userGithubIdentity.deleteMany({ where: { userId } });
}

/**
 * Resolve a GitHub actor (from a webhook payload or the API) to the Hub user who
 * owns it, or `null` if that GitHub account is not linked to any Hub user.
 *
 * **Id-first.** The numeric id is immutable and rename-proof, so it is the
 * trustworthy match; `login` is only a fallback for payloads that carry a
 * username but no id. A renamed account still resolves by id.
 */
export async function resolveHubUserByGithub(actor: {
  id?: string | null;
  login?: string | null;
}): Promise<string | null> {
  if (actor.id) {
    const byId = await prisma.userGithubIdentity.findUnique({
      where: { githubUserId: actor.id },
      select: { userId: true },
    });
    if (byId) return byId.userId;
  }
  if (actor.login) {
    const byLogin = await prisma.userGithubIdentity.findUnique({
      where: { githubLogin: actor.login },
      select: { userId: true },
    });
    if (byLogin) return byLogin.userId;
  }
  return null;
}
