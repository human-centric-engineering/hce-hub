import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import { ProjectView } from '@/components/hub/projects/project-view';
import type { ProjectTab, ProjectViewDTO } from '@/components/hub/projects/types';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';
import type { ProjectBoardDTO } from '@/components/hub/projects/board/types';

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

async function getBoard(id: string): Promise<ProjectBoardDTO | null> {
  try {
    const res = await serverFetch(`/api/v1/projects/${id}/board`);
    if (!res.ok) {
      // 404 ≡ the project 404 (handled via getProject → notFound); log the rest.
      if (res.status !== 404) logger.error('Hub board fetch failed', { id, status: res.status });
      return null;
    }
    const data = await parseApiResponse<ProjectBoardDTO>(res);
    return data.success ? data.data : null;
  } catch (error) {
    logger.error('Hub board fetch threw', { id, error });
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
  // Plan is the default; Board and Log are explicit. The Log tab is
  // client-fetched (filterable), so it needs no server payload here.
  const activeTab: ProjectTab = view === 'board' ? 'board' : view === 'log' ? 'log' : 'plan';

  // `id` may be a slug (the shareable URL) or a cuid. Resolve the header first —
  // it accepts both and returns the canonical cuid — then drive the cuid-only
  // sub-routes off `project.id` (§19 t-3). One extra hop when the URL is a slug.
  const project = await getProject(id);
  if (!project) notFound();

  const [plan, board] = await Promise.all([
    activeTab === 'plan' ? getPlan(project.id) : Promise.resolve(null),
    activeTab === 'board' ? getBoard(project.id) : Promise.resolve(null),
  ]);

  return <ProjectView project={project} activeTab={activeTab} plan={plan} board={board} />;
}
