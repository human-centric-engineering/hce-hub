import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import { ProjectView } from '@/components/hub/projects/project-view';
import type { ProjectTab, ProjectViewDTO } from '@/components/hub/projects/types';

export const metadata: Metadata = {
  title: 'Project',
};

async function getProject(id: string): Promise<ProjectViewDTO | null> {
  try {
    const res = await serverFetch(`/api/v1/projects/${id}`);
    if (!res.ok) {
      // 404 is expected for a non-member / unknown id (→ notFound); log the rest.
      if (res.status !== 404) logger.error('Hub project fetch failed', { id, status: res.status });
      return null;
    }
    const data = await parseApiResponse<ProjectViewDTO>(res);
    return data.success ? data.data : null;
  } catch (error) {
    logger.error('Hub project fetch threw', { id, error });
    return null;
  }
}

export default async function ProjectViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const activeTab: ProjectTab = view === 'board' ? 'board' : 'plan';

  const project = await getProject(id);
  if (!project) notFound();

  return <ProjectView project={project} activeTab={activeTab} />;
}
