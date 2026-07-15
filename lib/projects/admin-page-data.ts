/**
 * Server-side data helpers for the project-admin pages (f-project-admin t-2).
 * Shared by the create + edit pages so the user-picker fetch lives in one place.
 */
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { API } from '@/lib/api/endpoints';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import type { UserOption, ProjectDetailDTO } from '@/components/admin/projects/types';

/** All users, for the lead / member pickers (name-sorted, capped). */
export async function getSelectableUsers(): Promise<UserOption[]> {
  try {
    const res = await serverFetch(`${API.USERS.LIST}?limit=200&sortBy=name&sortOrder=asc`);
    if (!res.ok) return [];
    const data = await parseApiResponse<UserOption[]>(res);
    if (!data.success) return [];
    return data.data.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image ?? null,
    }));
  } catch {
    return [];
  }
}

/** A single project's detail, or `null` if it 404s / the fetch fails. */
export async function getProjectDetail(id: string): Promise<ProjectDetailDTO | null> {
  try {
    const res = await serverFetch(PROJECT_ADMIN_API.detail(id));
    if (!res.ok) return null;
    const data = await parseApiResponse<ProjectDetailDTO>(res);
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}
