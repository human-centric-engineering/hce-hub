import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import { ProjectView } from '@/components/hub/projects/project-view';
import {
  projectTabSpec,
  resolveProjectTab,
  type ProjectTabSpec,
} from '@/components/hub/projects/tabs';
import type { ProjectViewDTO } from '@/components/hub/projects/types';
import type { ProjectPlanDTO } from '@/components/hub/projects/plan/types';
import type { ProjectBoardDTO } from '@/components/hub/projects/board/types';
import type { IdeaInboxDTO } from '@/components/hub/projects/ideas/types';

/**
 * Dynamic tab title — starts with the project name so a browser tab / bookmark
 * reads "HCE Hub · Plan", not the generic "Project". Falls back to "Project" for
 * a non-member / unknown id (the page then `notFound()`s). `getProject` is the
 * same fetch the page runs; Next dedupes the GET within the request.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { view } = await searchParams;
  const project = await getProject(id);
  if (!project) return { title: 'Project' };
  // The SAME resolution + label the body uses (§33-sweep t-111). This used to be
  // its own ternary mapping `?view=` to a Title Case string, derived independently
  // of the one that picks the body — so the two could disagree and title the page
  // "Board" over a rendered Plan, with nothing failing.
  const { label } = projectTabSpec(resolveProjectTab(view));
  return { title: `${project.name} · ${label}` };
}

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

async function getIdeas(id: string): Promise<IdeaInboxDTO | null> {
  try {
    const res = await serverFetch(`/api/v1/projects/${id}/ideas`);
    if (!res.ok) {
      // 404 ≡ the project 404 (handled via getProject → notFound); log the rest.
      if (res.status !== 404) logger.error('Hub ideas fetch failed', { id, status: res.status });
      return null;
    }
    const data = await parseApiResponse<IdeaInboxDTO>(res);
    return data.success ? data.data : null;
  } catch (error) {
    logger.error('Hub ideas fetch threw', { id, error });
    return null;
  }
}

/**
 * Every payload kind a tab spec can declare, mapped to the fetcher that serves it.
 *
 * `satisfies Record<…>` is the point: add a payload kind to `ProjectTabSpec` and
 * this object fails to compile until it has a fetcher here. `satisfies` (not an
 * annotation) so each fetcher keeps its precise return type.
 *
 * **It forces the fetcher to exist, not to be used** (`/code-review`). Nothing
 * here makes you add the matching line to the `Promise.all` below, or the prop on
 * `ProjectView` — those props are optional. So a tab declaring an unwired payload
 * still compiles and renders `LoadFailed`, which is exactly the "looks like a
 * failed request" outcome this guard is often assumed to prevent. The assertion
 * that actually closes that gap is in `id-page-tabs.test.tsx`, which derives the
 * payload kinds from the registry and checks each one is really fetched.
 */
const PAYLOAD_FETCHERS = {
  plan: getPlan,
  board: getBoard,
  ideas: getIdeas,
} satisfies Record<NonNullable<ProjectTabSpec['payload']>, (id: string) => Promise<unknown>>;

export default async function ProjectViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; phase?: string }>;
}) {
  const { id } = await params;
  // `phase` is the deep-link (§33 t-99): open the Plan with that band expanded and
  // scrolled to. Only meaningful on the Plan, which is also the default tab, so a
  // bare `?phase=` link needs no `?view=`.
  const { view, phase } = await searchParams;
  const activeTab = resolveProjectTab(view);

  // `id` may be a slug (the shareable URL) or a cuid. Resolve the header first —
  // it accepts both and returns the canonical cuid — then drive the cuid-only
  // sub-routes off `project.id` (§19 t-3). One extra hop when the URL is a slug.
  const project = await getProject(id);
  if (!project) notFound();

  // Only the active tab's payload is fetched, and WHICH one is the registry's
  // `payload` rather than a hand-written list of tab keys — so a client-fetched
  // tab (`payload: null`, the Log and Connect) can never accidentally trigger a
  // server fetch, and a new tab declaring `payload: 'plan'` reuses this one.
  //
  // Still three lines because `plan`, `board` and `ideas` are three different
  // shapes arriving as three different props; collapsing them to one generic
  // fetch would erase the typing the view depends on. `PAYLOAD_FETCHERS` is what
  // stops this being somewhere to forget.
  const { payload } = projectTabSpec(activeTab);
  const [plan, board, ideas] = await Promise.all([
    payload === 'plan' ? PAYLOAD_FETCHERS.plan(project.id) : null,
    payload === 'board' ? PAYLOAD_FETCHERS.board(project.id) : null,
    payload === 'ideas' ? PAYLOAD_FETCHERS.ideas(project.id) : null,
  ]);

  return (
    <ProjectView
      project={project}
      activeTab={activeTab}
      plan={plan}
      board={board}
      ideas={ideas}
      focusPhaseId={phase ?? null}
    />
  );
}
