import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ProjectCard } from '@/components/hub/projects/project-card';
import type { ProjectCard as ProjectCardData } from '@/components/hub/projects/types';

/**
 * The member's projects grid. New projects are created in the admin shell
 * (f-project-admin), so the "New project" affordance only shows for admins
 * (`canCreate`) — a non-admin member can't reach `/admin/projects/new`, so they
 * get a plain empty state instead of a dead-end link.
 */
export function ProjectsGrid({
  projects,
  canCreate,
}: {
  projects: ProjectCardData[];
  canCreate: boolean;
}) {
  if (projects.length === 0 && !canCreate) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
        You&apos;re not a member of any projects yet. An admin can add you to one.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
      {canCreate && (
        <Link
          href="/admin/projects/new"
          className="text-muted-foreground hover:border-foreground/20 hover:text-foreground focus-visible:ring-ring flex min-h-[132px] flex-col items-center justify-center rounded-xl border border-dashed p-5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Plus className="mb-1 h-5 w-5" />
          New project
        </Link>
      )}
    </div>
  );
}
