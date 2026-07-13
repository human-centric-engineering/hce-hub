/**
 * Hub project domain — public surface.
 *
 * Re-exports the membership authorization funnel (f-access). Import from
 * `@/lib/projects` so consumers depend on the funnel, not the file layout.
 */
export {
  canAccessProject,
  requireProjectAccess,
  getAccessibleProject,
  listAccessibleProjects,
  accessibleProjectIds,
  type ProjectAccessBasis,
  type ProjectAccessNeed,
  type ProjectAccessResult,
} from '@/lib/projects/access';
