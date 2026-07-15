/**
 * Zod schemas for the project-admin API (f-project-admin, feature 05).
 *
 * Fork-owned validations for the admin project + member CRUD surface. Kept in
 * its own module (not the Sunrise `orchestration.ts`) so it's clearly app-tier
 * and import-scoped for pure schema tests. `hostPlatform` is restricted to the
 * known host-platform slugs (the single source of truth is
 * `lib/projects/host-platforms.ts`, §7).
 */

import { z } from 'zod';
import { nonEmptyStringSchema, urlSchema, paginationQuerySchema } from '@/lib/validations/common';
import { isKnownHostPlatform } from '@/lib/projects/host-platforms';

/** Project lifecycle status — mirrors the `ProjectStatus` enum in app.prisma. */
export const projectStatusSchema = z.enum(['planning', 'active', 'archived']);

const hostPlatformSchema = z.string().trim().refine(isKnownHostPlatform, 'Unknown host platform');

const repoUrlsSchema = z.array(urlSchema).max(20, 'At most 20 repo URLs');

/** POST /admin/projects — create a project (and seat its lead + knowledge tag). */
export const createProjectSchema = z.object({
  name: nonEmptyStringSchema.max(200, 'Name too long'),
  hostPlatform: hostPlatformSchema,
  /** The lead is seated as a `role='lead'` ProjectMember row transactionally. */
  leadUserId: nonEmptyStringSchema,
  repoUrls: repoUrlsSchema.optional(),
  status: projectStatusSchema.optional(),
});

/**
 * PATCH /admin/projects/:id — update scalars and/or reassign the lead.
 * All fields optional; supplying `leadUserId` reassigns the lead (moving the
 * `role='lead'` member row — the invariant is preserved in the service).
 */
export const updateProjectSchema = z
  .object({
    name: nonEmptyStringSchema.max(200, 'Name too long'),
    hostPlatform: hostPlatformSchema,
    leadUserId: nonEmptyStringSchema,
    repoUrls: repoUrlsSchema,
    status: projectStatusSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

/** POST /admin/projects/:id/members — add a member (always `role='member'` in v1). */
export const addMemberSchema = z.object({
  userId: nonEmptyStringSchema,
});

/** GET /admin/projects — paginated list with optional `q` search. */
export const listProjectsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
