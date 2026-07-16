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

// Plan view — feature tree in optimal working order (f-plan-view).
export {
  getProjectPlan,
  type ProjectPlan,
  type PlanFeatureView,
  type PlanTaskView,
  type PlanDependencyRef,
} from '@/lib/projects/plan';
export { planOrder, type PlanOrderInput } from '@/lib/projects/plan-order';

// Board view — tasks routed into member lanes × effective-status columns (f-board-view).
export {
  getProjectBoard,
  BOARD_COLUMNS,
  type BoardColumn,
  type ProjectBoard,
  type BoardLane,
  type BoardTaskCard,
} from '@/lib/projects/board';

// Task sheet — one task's full detail + dependency graph (f-task-sheet).
export { getTaskDetail, type TaskDetail, type TaskDetailRef } from '@/lib/projects/task-detail';

// Claim a task — shared by the capability + the consumer route (f-task-sheet).
export { claimTask, type ClaimTaskResult } from '@/lib/projects/claim-task-service';
