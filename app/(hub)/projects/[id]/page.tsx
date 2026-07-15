import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import { ProjectView } from '@/components/hub/projects/project-view';
import type { ProjectTab, ProjectViewDTO } from '@/components/hub/projects/types';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';

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

async function getPlan(id: string): Promise<ProjectPlanDTO | null> {
  try {
    const res = await serverFetch(`/api/v1/projects/${id}/plan`);
    if (!res.ok) {
      // 404 ≡ the project 404 (handled via getProject → notFound); log the rest.
      if (res.status !== 404) logger.error('Hub plan fetch failed', { id, status: res.status });
      return null;
    }
    const data = await parseApiResponse<ProjectPlanDTO>(res);
    return data.success ? data.data : null;
  } catch (error) {
    logger.error('Hub plan fetch threw', { id, error });
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

  // Fetch the header and (only on the Plan tab) the plan in parallel — no waterfall.
  const [project, plan] = await Promise.all([
    getProject(id),
    activeTab === 'plan' ? getPlan(id) : Promise.resolve(null),
  ]);
  if (!project) notFound();

  return <ProjectView project={project} activeTab={activeTab} plan={plan} />;
}
