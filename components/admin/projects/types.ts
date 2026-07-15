/**
 * Client-facing DTOs for the project-admin UI (f-project-admin t-2).
 *
 * These mirror the server service's return shapes (`lib/projects/admin.ts`) but
 * with `Date`s as ISO strings (the shape after JSON transit) — so client
 * components don't import the server module (which pulls Prisma).
 */

export interface UserOption {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/** A row in the projects list (GET /admin/projects). */
export interface ProjectRow {
  id: string;
  name: string;
  hostPlatform: string;
  status: 'planning' | 'active' | 'archived';
  createdAt: string;
  memberCount: number;
  lead: UserOption | null;
}

export interface ProjectMemberRow {
  userId: string;
  role: 'lead' | 'member';
  addedAt: string;
  /** `null` when the user was erased (rendered as "former member"). */
  user: UserOption | null;
}

/** Full project detail (GET /admin/projects/:id). */
export interface ProjectDetailDTO {
  id: string;
  name: string;
  hostPlatform: string;
  status: 'planning' | 'active' | 'archived';
  repoUrls: string[];
  leadUserId: string | null;
  knowledgeTagId: string | null;
  createdAt: string;
  lead: UserOption | null;
  members: ProjectMemberRow[];
  knowledgeTag: { id: string; slug: string; name: string } | null;
}
