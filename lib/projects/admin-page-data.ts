/**
 * Server-side data helpers for the project-admin pages (f-project-admin t-2).
 * Shared by the create + edit pages so the user-picker fetch lives in one place.
 */
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { API } from '@/lib/api/endpoints';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import { logger } from '@/lib/logging';
import type { UserOption, ProjectDetailDTO } from '@/components/admin/projects/types';

/**
 * All users, for the lead / member pickers (name-sorted, capped).
 *
 * `limit=100` is the users endpoint's hard maximum (`listUsersQuerySchema`
 * rejects anything larger with a 400 *before* clamping) — requesting more
 * returns zero users and silently empties the pickers.
 */
export async function getSelectableUsers(): Promise<UserOption[]> {
  try {
    const res = await serverFetch(`${API.USERS.LIST}?limit=100&sortBy=name&sortOrder=asc`);
    if (!res.ok) {
      logger.error('getSelectableUsers: users list fetch failed', { status: res.status });
      return [];
    }
    const data = await parseApiResponse<UserOption[]>(res);
    if (!data.success) return [];
    return data.data.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image ?? null,
    }));
  } catch (error) {
    logger.error('getSelectableUsers threw', { error });
    return [];
  }
}

/** A single project's detail, or `null` if it 404s / the fetch fails. */
export async function getProjectDetail(id: string): Promise<ProjectDetailDTO | null> {
  try {
    const res = await serverFetch(PROJECT_ADMIN_API.detail(id));
    if (!res.ok) {
      // A 404 is expected (unknown id → notFound); log anything else.
      if (res.status !== 404) {
        logger.error('getProjectDetail: fetch failed', { id, status: res.status });
      }
      return null;
    }
    const data = await parseApiResponse<ProjectDetailDTO>(res);
    return data.success ? data.data : null;
  } catch (error) {
    logger.error('getProjectDetail threw', { id, error });
    return null;
  }
}
