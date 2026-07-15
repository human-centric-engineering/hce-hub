import type { Metadata } from 'next';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { getServerSession } from '@/lib/auth/utils';
import { logger } from '@/lib/logging';
import { ProjectsGrid } from '@/components/hub/projects/projects-grid';
import type { ProjectCard } from '@/components/hub/projects/types';

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Your projects',
};

async function getMyProjects(): Promise<ProjectCard[]> {
  try {
    const res = await serverFetch('/api/v1/projects');
    if (!res.ok) {
      logger.error('Hub projects fetch failed', { status: res.status });
      return [];
    }
    const data = await parseApiResponse<ProjectCard[]>(res);
    return data.success ? data.data : [];
  } catch (error) {
    logger.error('Hub projects fetch threw', { error });
    return [];
  }
}

export default async function ProjectsPage() {
  const [projects, session] = await Promise.all([getMyProjects(), getServerSession()]);
  const canCreate = session?.user.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-6">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Projects</h1>
        <p className="text-muted-foreground mt-1 text-[15px]">
          The projects you&apos;re a member of.
        </p>
      </div>
      <ProjectsGrid projects={projects} canCreate={canCreate} />
    </div>
  );
}
