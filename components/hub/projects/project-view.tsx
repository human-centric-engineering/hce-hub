import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getHostPlatform } from '@/lib/projects/host-platforms';
import { ProjectViewTabs } from '@/components/hub/projects/project-view-tabs';
import { STATUS_VARIANT, initials } from '@/components/hub/projects/presentation';
import { BreadcrumbLabel } from '@/components/hub/breadcrumb-label';
import { PlanView } from '@/components/hub/projects/plan/plan-view';
import { BoardView } from '@/components/hub/projects/board/board-view';
import type { ProjectTab, ProjectViewDTO } from '@/components/hub/projects/types';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';
import type { ProjectBoardDTO } from '@/components/hub/projects/board/types';

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

/**
 * The project-view container: header (name/status/platform + member stack) and
 * the linkable Plan⇄Board tabs. The Plan tab mounts the Plan view (§09); the
 * Board tab mounts the Board (§10). Each tab's payload is fetched by the page.
 */
export function ProjectView({
  project,
  activeTab,
  plan,
  board,
}: {
  project: ProjectViewDTO;
  activeTab: ProjectTab;
  /** The Plan payload — supplied only on the Plan tab; `null` if its fetch failed. */
  plan?: ProjectPlanDTO | null;
  /** The Board payload — supplied only on the Board tab; `null` if its fetch failed. */
  board?: ProjectBoardDTO | null;
}) {
  const platform = getHostPlatform(project.hostPlatform)?.label ?? project.hostPlatform;

  // Full-width, left-aligned — the board spans the whole main column (design
  // handoff §3); the header + tabs align to the left edge, not centered.
  return (
    <div className="px-8 py-10">
      {/* Replace the raw project-id breadcrumb leaf with the project name. */}
      <BreadcrumbLabel segment={project.id} label={project.name} />
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

      <div className="py-8">
        {activeTab === 'plan' ? (
          plan ? (
            <PlanView plan={plan} />
          ) : (
            <p className="text-muted-foreground py-16 text-center text-sm">
              Couldn&rsquo;t load the plan just now — try refreshing.
            </p>
          )
        ) : board ? (
          <BoardView board={board} />
        ) : (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Couldn&rsquo;t load the board just now — try refreshing.
          </p>
        )}
      </div>
    </div>
  );
}
