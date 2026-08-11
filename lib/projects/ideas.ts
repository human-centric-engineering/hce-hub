/**
 * Project Ideas inbox read (f-idea-capture §22, t-62).
 *
 * The list the Ideas inbox renders — a project's captured ideas that are still
 * **actionable**: `open` (to triage) and `dropped` (the reversible archive).
 * `promoted` ideas are excluded — they became a feature/task/phase/bug and are no
 * longer inbox items.
 *
 * Membership is the [[f-access]] funnel's, not re-implemented here: the load goes
 * through `getAccessibleProject`, so a **non-member or unknown id is a 404, never
 * a 403** (anti-enumeration). `createdByUserId` is a hand-FK, so the author
 * resolves to `UserRef | null` (rendered "unknown / former member"), never
 * dereferenced. Dates are serialised to ISO strings for the client payload.
 */
import type { IdeaStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { getAccessibleProject } from '@/lib/projects/access';
import { fetchUsers, type UserRef } from '@/lib/projects/user-refs';

/** An idea row in the inbox. */
export interface IdeaView {
  id: string;
  text: string;
  /** `open` (to triage) or `dropped` (archived, restorable). Never `promoted` here. */
  status: Extract<IdeaStatus, 'open' | 'dropped'>;
  /** `null` when the author was erased. */
  createdBy: UserRef | null;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601 — when it was dropped; `null` while open. */
  triagedAt: string | null;
}

/** The Ideas inbox payload — the `/ideas` GET serves this in one request. */
export interface IdeaInboxDTO {
  ideas: IdeaView[];
}

/**
 * Read `projectId`'s actionable ideas (open + dropped) for `userId`. Throws
 * `NotFoundError` (→ 404) for a non-member / unknown project. Newest first.
 */
export async function getProjectIdeas(userId: string, projectId: string): Promise<IdeaInboxDTO> {
  const project = await getAccessibleProject(userId, projectId);

  const rows = await prisma.idea.findMany({
    where: { projectId: project.id, status: { in: ['open', 'dropped'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      text: true,
      status: true,
      createdByUserId: true,
      createdAt: true,
      triagedAt: true,
    },
  });

  const users = await fetchUsers(rows.map((r) => r.createdByUserId).filter((id) => id !== null));

  const ideas: IdeaView[] = rows.map((r) => ({
    id: r.id,
    text: r.text,
    status: r.status as Extract<IdeaStatus, 'open' | 'dropped'>,
    createdBy: r.createdByUserId ? (users.get(r.createdByUserId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    triagedAt: r.triagedAt ? r.triagedAt.toISOString() : null,
  }));

  return { ideas };
}
