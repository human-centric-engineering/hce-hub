import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getHostPlatform } from '@/lib/projects/host-platforms';
import { ProjectViewTabs } from '@/components/hub/projects/project-view-tabs';
import { STATUS_VARIANT, initials } from '@/components/hub/projects/presentation';
import { BreadcrumbLabel } from '@/components/hub/breadcrumb-label';
import { PlanView } from '@/components/hub/projects/plan/plan-view';
import { BoardView } from '@/components/hub/projects/board/board-view';
import { LogView } from '@/components/hub/projects/log/log-view';
import { IdeasView } from '@/components/hub/projects/ideas/ideas-view';
import { ConnectPanel } from '@/components/hub/projects/connect/connect-panel';
import { JotIdeaButton } from '@/components/hub/projects/ideas/jot-idea-button';
import { ActiveBugsStrip } from '@/components/hub/projects/active-bugs-strip';
import { TaskSheetProvider } from '@/components/hub/projects/task-sheet/task-sheet-host';
import { ProjectLiveProvider } from '@/components/hub/projects/project-live';
import { projectTabSpec, type ProjectTab } from '@/components/hub/projects/tabs';
import type { ProjectViewDTO } from '@/components/hub/projects/types';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';
import type { ProjectBoardDTO } from '@/components/hub/projects/board/types';
import type { IdeaInboxDTO } from '@/components/hub/projects/ideas/types';

/**
 * The shared "that tab's payload didn't arrive" message. Extracted only because
 * the switch below now names it three times; the copy is unchanged.
 */
function LoadFailed({ what }: { what: string }) {
  return (
    <p className="text-muted-foreground py-16 text-center text-sm">
      Couldn&rsquo;t load {what} just now — try refreshing.
    </p>
  );
}

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
  ideas,
  focusPhaseId = null,
}: {
  project: ProjectViewDTO;
  activeTab: ProjectTab;
  /** The Plan payload — supplied only on the Plan tab; `null` if its fetch failed. */
  plan?: ProjectPlanDTO | null;
  /** The Board payload — supplied only on the Board tab; `null` if its fetch failed. */
  board?: ProjectBoardDTO | null;
  /** The Ideas inbox payload — supplied only on the Ideas tab; `null` if its fetch failed. */
  ideas?: IdeaInboxDTO | null;
  /** `?phase=` — open the Plan on this band and scroll to it (§33 t-99). */
  focusPhaseId?: string | null;
}) {
  const platform = getHostPlatform(project.hostPlatform)?.label ?? project.hostPlatform;

  // A `switch` rather than the nested ternary this replaces, so the compiler can
  // see it is exhaustive (§33-sweep t-111). The ternary's final `else` was the
  // Log, which meant a tab added to the registry without a body here would have
  // silently rendered the journal — wrong content, no error, on a surface nobody
  // was looking at yet. Now it does not build.
  //
  // A body cannot come from the registry: each is a different component with
  // different props. What the registry gives is the exhaustiveness to check it
  // against.
  let body: React.ReactNode;
  switch (activeTab) {
    case 'plan':
      body = plan ? (
        <PlanView plan={plan} focusPhaseId={focusPhaseId} />
      ) : (
        <LoadFailed what="the plan" />
      );
      break;
    case 'board':
      body = board ? <BoardView board={board} /> : <LoadFailed what="the board" />;
      break;
    case 'ideas':
      body = ideas ? (
        <IdeasView projectId={project.id} inbox={ideas} />
      ) : (
        <LoadFailed what="ideas" />
      );
      break;
    case 'connect':
      // Connect — the member's self-service scoped-key surface (f-mcp-project-scope
      // §31 t-C/t-D), client-fetched. `repoUrls` come from the header DTO.
      body = (
        <ConnectPanel
          projectId={project.id}
          projectName={project.name}
          serverName={project.slug ?? project.id}
          repoUrls={project.repoUrls}
        />
      );
      break;
    case 'log':
      // Log — the journal stream, client-fetched + filterable (f-journal §17).
      body = <LogView projectId={project.id} projectRef={project.slug ?? project.id} />;
      break;
    default: {
      // Type-safe exhaustive check
      const _exhaustiveCheck: never = activeTab;
      throw new Error(`Unhandled project tab: ${String(_exhaustiveCheck)}`);
    }
  }

  // Full-width, left-aligned — the board spans the whole main column (design
  // handoff §3); the header + tabs align to the left edge, not centered.
  return (
    <div className="px-8 py-10">
      {/* Replace the raw project-segment breadcrumb leaf with the project name.
          Register both the cuid and the slug so the label resolves whichever the
          URL used (nav links now prefer the slug — §19). */}
      <BreadcrumbLabel segment={project.id} label={project.name} />
      {project.slug && <BreadcrumbLabel segment={project.slug} label={project.name} />}
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
        <div className="flex items-center gap-3">
          <JotIdeaButton projectId={project.id} />
          <MemberStack members={project.members} />
        </div>
      </div>

      {/* One poller for the whole page (f-realtime §36 t-126). Outside the sheet
          provider because it is not the sheet's concern, and because everything
          below — tabs, strip, body and sheet alike — reads the same change count.
          Server-rendered tabs come back via `router.refresh()`; the client-fetched
          ones (Log, sheet, activity) take `useProjectLive()` as an effect dep. */}
      {/* Keyed: an unkeyed instance surviving a client-side project→project
          navigation would carry A's revision in as B's baseline (a spurious
          refresh on arrival) and could pin A's "no longer have access" notice
          over B. No such link exists in the UI today — the trap is latent, and
          one character closes it (`/code-review`). */}
      <ProjectLiveProvider key={project.id} projectId={project.id}>
        {/* The task sheet opens (deep-linked via `?task=`) over whichever tab is
          active — mounted here so Plan rows and Board cards can open it. */}
        <TaskSheetProvider projectId={project.id} projectRef={project.slug ?? project.id}>
          <ProjectViewTabs projectRef={project.slug ?? project.id} active={activeTab} />

          {/* The active-bugs strip sits above the work body (Plan/Board) — a
            different axis (bugs from any phase), self-hiding when empty (it
            carries its own top spacing, so an empty strip leaves no gap). The list
            is defaulted defensively — a missing field should hide the strip, not
            crash.

            WHICH tabs get it is the registry's `showsBugStrip`, not a negative
            list here (§33-sweep t-111). The old `!== 'log' && !== 'ideas' &&
            !== 'connect'` form defaulted a tab nobody had thought about yet INTO
            the strip; now a new tab has to opt in. */}
          {projectTabSpec(activeTab).showsBugStrip && (
            <ActiveBugsStrip bugs={project.activeBugs ?? []} projectId={project.id} />
          )}

          <div className="py-8">{body}</div>
        </TaskSheetProvider>
      </ProjectLiveProvider>
    </div>
  );
}
