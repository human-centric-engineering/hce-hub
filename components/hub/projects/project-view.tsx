import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getHostPlatform } from '@/lib/projects/host-platforms';
import { ProjectViewTabs } from '@/components/hub/projects/project-view-tabs';
import { STATUS_VARIANT, initials } from '@/components/hub/projects/presentation';
import type { ProjectTab, ProjectViewDTO } from '@/components/hub/projects/types';

/** A stacked row of member avatars (overflow collapses to a +N chip). */
function MemberStack({ members }: { members: ProjectViewDTO['members'] }) {
  const shown = members.slice(0, 5);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((m) => (
          <Avatar key={m.userId} className="ring-background h-7 w-7 ring-2">
            {m.user?.image && <AvatarImage src={m.user.image} alt="" />}
            <AvatarFallback className="text-[10px]">
              {m.user ? initials(m.user.name) : '—'}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      {extra > 0 && <span className="text-muted-foreground ml-2 text-xs">+{extra}</span>}
    </div>
  );
}

const TAB_COPY: Record<ProjectTab, string> = {
  plan: 'The Plan view — features in optimal working order — arrives with f-plan-view.',
  board: 'The Board view — what’s in flight, by person — arrives with f-board-view.',
};

/**
 * The project-view container: header (name/status/platform + member stack) and
 * the linkable Plan⇄Board tabs. The tab *content* is a scaffold placeholder in
 * §08 — the real Plan/Board views mount here in §09/§10.
 */
export function ProjectView({
  project,
  activeTab,
}: {
  project: ProjectViewDTO;
  activeTab: ProjectTab;
}) {
  const platform = getHostPlatform(project.hostPlatform)?.label ?? project.hostPlatform;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-medium tracking-[-0.025em]">{project.name}</h1>
            <Badge variant={STATUS_VARIANT[project.status] ?? 'secondary'}>{project.status}</Badge>
          </div>
          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <Badge variant="outline">{platform}</Badge>
            <span>
              {project.featureCount} features · {project.taskCount} tasks
            </span>
          </div>
        </div>
        <MemberStack members={project.members} />
      </div>

      <ProjectViewTabs projectId={project.id} active={activeTab} />

      <div className="text-muted-foreground py-16 text-center text-sm">{TAB_COPY[activeTab]}</div>
    </div>
  );
}
