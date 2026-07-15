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

// Admin project + member CRUD service (f-project-admin).
export {
  listProjects,
  getProjectDetail,
  createProject,
  updateProject,
  archiveProject,
  addMember,
  removeMember,
  type AdminActor,
  type ProjectListItem,
  type ProjectDetail,
  type ProjectMemberView,
  type UserRef,
} from '@/lib/projects/admin';

export {
  HOST_PLATFORMS,
  HOST_PLATFORM_SLUGS,
  isKnownHostPlatform,
  getHostPlatform,
  type HostPlatformDescriptor,
} from '@/lib/projects/host-platforms';

// Consumer (member-facing) project reads (f-projects).
export {
  listProjectsForUser,
  getProjectForUser,
  type ProjectCard,
  type ProjectView,
  type ProjectMemberView as ConsumerProjectMemberView,
} from '@/lib/projects/consumer';
