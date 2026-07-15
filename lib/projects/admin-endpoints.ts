/**
 * Project-admin API paths (fork-owned, client-safe).
 *
 * Kept out of Sunrise's core `lib/api/endpoints.ts` (platform-owned) so the fork
 * doesn't edit a core file; both the server pages (`serverFetch`) and the client
 * forms (`apiClient`) import these. (f-project-admin, feature 05.)
 */
export const PROJECT_ADMIN_API = {
  list: '/api/v1/admin/projects',
  create: '/api/v1/admin/projects',
  detail: (id: string): string => `/api/v1/admin/projects/${id}`,
  members: (id: string): string => `/api/v1/admin/projects/${id}/members`,
  member: (id: string, userId: string): string =>
    `/api/v1/admin/projects/${id}/members/${encodeURIComponent(userId)}`,
} as const;
