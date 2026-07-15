/**
 * User-reference enrichment for the Hub project services.
 *
 * `Project.leadUserId` / `ProjectMember.userId` are hand-FKs to `"user"` with no
 * Prisma relation, so member/lead identities are resolved with a separate,
 * batched `user` lookup rather than an `include`. Shared by the admin
 * (`admin.ts`) and consumer (`consumer.ts`) services so both enrich the same way
 * and render a missing user gracefully (`null` → "former member" / "unassigned").
 */
import { prisma } from '@/lib/db/client';

/** A user reference for display; `null` at a call site means the user was erased. */
export interface UserRef {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** Batch-resolve `ids` → a `Map` of the users that still exist (missing ids are absent). */
export async function fetchUsers(ids: readonly string[]): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true, image: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}
