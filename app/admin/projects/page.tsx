import type { Metadata } from 'next';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import { ProjectsList } from '@/components/admin/projects/projects-list';
import type { ProjectRow } from '@/components/admin/projects/types';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Create and manage Hub projects, members, and project knowledge',
};

async function getProjects(): Promise<ProjectRow[]> {
  try {
    const res = await serverFetch(`${PROJECT_ADMIN_API.list}?limit=100`);
    if (!res.ok) return [];
    const data = await parseApiResponse<ProjectRow[]>(res);
    return data.success ? data.data : [];
  } catch {
    return [];
  }
}

export default async function ProjectsAdminPage() {
  const projects = await getProjects();
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <ProjectsList projects={projects} />
    </div>
  );
}
