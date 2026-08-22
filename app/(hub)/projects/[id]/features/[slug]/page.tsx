import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import { BreadcrumbLabel } from '@/components/hub/breadcrumb-label';
import { TaskSheetProvider } from '@/components/hub/projects/task-sheet/task-sheet-host';
import { ProjectLiveProvider } from '@/components/hub/projects/project-live';
import { FeatureView } from '@/components/hub/projects/feature-view/feature-view';
import type { FeatureDetailDTO } from '@/components/hub/projects/feature-view/types';

/**
 * Dynamic tab title — the feature's own name (e.g. "Membership funnel"), not the
 * generic "Feature". Falls back to "Feature" for a non-member / unknown feature
 * (the page then `notFound()`s). `getFeature` is the same fetch the page runs;
 * Next dedupes the GET within the request.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}): Promise<Metadata> {
  const { id, slug } = await params;
  const feature = await getFeature(id, slug);
  return { title: feature ? feature.title : 'Feature' };
}

/**
 * Same rule as the project page: `null` means 404 and nothing else, so a transient
 * failure on a timer-driven refresh reaches the error boundary rather than telling
 * the user their feature does not exist (`/code-review`).
 */
async function getFeature(id: string, key: string): Promise<FeatureDetailDTO | null> {
  let res: Response;
  try {
    res = await serverFetch(
      `/api/v1/projects/${encodeURIComponent(id)}/features/${encodeURIComponent(key)}`
    );
  } catch (error) {
    logger.error('Hub feature fetch threw', { id, key, error });
    throw error;
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    logger.error('Hub feature fetch failed', { id, key, status: res.status });
    throw new Error(`Feature fetch failed: ${res.status}`);
  }

  const data = await parseApiResponse<FeatureDetailDTO>(res);
  if (!data.success) throw new Error('Feature fetch returned an unsuccessful envelope');
  return data.data;
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;
  const feature = await getFeature(id, slug);
  if (!feature) notFound();

  return (
    <>
      {/* Resolve the raw id/slug breadcrumb segments to human labels. */}
      <BreadcrumbLabel segment={id} label={feature.projectName} />
      <BreadcrumbLabel segment={slug} label={feature.title} />
      {/* The task sheet opens (deep-linked via `?task=`) over the feature page —
          mounted here so the feature's task rows can open it in place. */}
      {/* One poller for this page too — the feature view, its task list and its
          activity timeline age exactly like the Plan does (f-realtime §36 t-126). */}
      <ProjectLiveProvider key={feature.projectId} projectId={feature.projectId}>
        <TaskSheetProvider
          projectId={feature.projectId}
          projectRef={feature.projectSlug ?? feature.projectId}
        >
          <FeatureView feature={feature} />
        </TaskSheetProvider>
      </ProjectLiveProvider>
    </>
  );
}
