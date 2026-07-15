import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getHostPlatform } from '@/lib/projects/host-platforms';
import { STATUS_VARIANT, initials } from '@/components/hub/projects/presentation';
import type { ProjectCard as ProjectCardData } from '@/components/hub/projects/types';

/** One project in the grid — links to the project view. */
export function ProjectCard({ project }: { project: ProjectCardData }) {
  const platform = getHostPlatform(project.hostPlatform)?.label ?? project.hostPlatform;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="bg-card hover:border-foreground/20 focus-visible:ring-ring block rounded-xl border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[17px] leading-tight font-medium tracking-[-0.01em]">{project.name}</h2>
        <Badge variant={STATUS_VARIANT[project.status] ?? 'secondary'}>{project.status}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Badge variant="outline">{platform}</Badge>
        <span className="text-muted-foreground text-xs">
          {project.featureCount} {project.featureCount === 1 ? 'feature' : 'features'} ·{' '}
          {project.memberCount} {project.memberCount === 1 ? 'member' : 'members'}
        </span>
      </div>

      <div className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
        {project.lead ? (
          <>
            <Avatar className="h-6 w-6">
              {project.lead.image && <AvatarImage src={project.lead.image} alt="" />}
              <AvatarFallback className="text-[10px]">{initials(project.lead.name)}</AvatarFallback>
            </Avatar>
            <span>{project.lead.name}</span>
          </>
        ) : (
          <span className="italic">Unassigned lead</span>
        )}
      </div>
    </Link>
  );
}
