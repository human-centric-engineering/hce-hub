/**
 * Client-facing DTOs for the consumer projects UI (f-projects t-2).
 * Mirror the consumer service shapes (`lib/projects/consumer.ts`) with `Date`s
 * as ISO strings (post-JSON) so client components don't import the server module.
 */

export interface UserRef {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/** A card in the member's projects grid (`GET /api/v1/projects`). */
export interface ProjectCard {
  id: string;
  /** Shareable human URL key (`hce-hub`); `null` until authored — links fall back to `id`. */
  slug: string | null;
  name: string;
  hostPlatform: string;
  status: 'planning' | 'active' | 'archived';
  createdAt: string;
  memberCount: number;
  featureCount: number;
  lead: UserRef | null;
}

export interface ProjectMemberRef {
  userId: string;
  role: 'lead' | 'member';
  user: UserRef | null;
}

/**
 * An open bug-kind task in the active-bugs strip (f-bug-handling §22-02 t2) —
 * a reference to a bug + a breadcrumb to its origin feature/phase.
 */
export interface ActiveBugDTO {
  taskId: string;
  taskNumber: number | null;
  title: string;
  feature: { slug: string | null; title: string };
  phaseName: string | null;
}

/** The project-view header (`GET /api/v1/projects/:id`). */
export interface ProjectViewDTO {
  id: string;
  /** Shareable human URL key (`hce-hub`); `null` until authored — links fall back to `id`. */
  slug: string | null;
  name: string;
  hostPlatform: string;
  status: 'planning' | 'active' | 'archived';
  repoUrls: string[];
  leadUserId: string | null;
  createdAt: string;
  lead: UserRef | null;
  members: ProjectMemberRef[];
  memberCount: number;
  featureCount: number;
  taskCount: number;
  /** Open bug-kind tasks across the project — the active-bugs strip; `[]` when none. */
  activeBugs: ActiveBugDTO[];
}

/** The project-view tabs (linkable via `?view=`). */
// `ProjectTab` now lives with the tab registry it is derived from —
// `components/hub/projects/tabs.ts` (§33-sweep t-111). Kept out of here on
// purpose: a hand-written union next to the registry is exactly the second
// source of truth the registry exists to remove.
