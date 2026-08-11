/**
 * Shared create/edit project form schema (f-project-admin t-2).
 *
 * One schema for both `ProjectCreateForm` and `ProjectEditForm` so their field
 * validation can't drift. `repoUrlsText` is a one-per-line textarea; each
 * non-empty line must be a valid URL (mirrors the server's `z.array(urlSchema)`)
 * so a bad line is caught inline rather than as an opaque top-level 400.
 */
import { z } from 'zod';
import { isKnownHostPlatform } from '@/lib/projects/host-platforms';
import { PROJECT_SLUG_PATTERN } from '@/lib/projects/project-slug';
import { urlSchema } from '@/lib/validations/common';
import { splitRepoUrls } from '@/components/admin/projects/repo-urls';

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
  // Blank is meaningful and differs per form: on create it means "derive one from
  // the name" (the server's job); on edit it means "leave the slug as it is". Both
  // forms omit `slug` from the request body when it's blank. Shape only — global
  // uniqueness is the DB's `@unique`, surfaced as a 409 on submit.
  slug: z
    .string()
    .trim()
    .max(100, 'URL key is too long')
    .refine(
      (v) => v === '' || PROJECT_SLUG_PATTERN.test(v),
      'Lowercase words separated by single hyphens (e.g. "hce-hub")'
    ),
  hostPlatform: z.string().refine(isKnownHostPlatform, 'Choose a host platform'),
  leadUserId: z.string().min(1, 'Choose a project lead'),
  status: z.enum(['planning', 'active', 'archived']),
  repoUrlsText: z
    .string()
    .optional()
    .refine(
      (text) => splitRepoUrls(text).every((u) => urlSchema.safeParse(u).success),
      'Each line must be a valid URL'
    ),
});

export type ProjectFormData = z.infer<typeof projectFormSchema>;
