import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ProjectCard } from '@/components/hub/projects/project-card';
import type { ProjectCard as ProjectCardData } from '@/components/hub/projects/types';

/**
 * The member's projects grid. New projects are created in the admin shell
 * (f-project-admin), so the empty/affordance state links there rather than
 * offering an inline create.
 */
export function ProjectsGrid({ projects }: { projects: ProjectCardData[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
      <Link
        href="/admin/projects/new"
        className="text-muted-foreground hover:border-foreground/20 hover:text-foreground focus-visible:ring-ring flex min-h-[132px] flex-col items-center justify-center rounded-xl border border-dashed p-5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Plus className="mb-1 h-5 w-5" />
        New project
      </Link>
    </div>
  );
}
