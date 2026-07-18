import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { logger } from '@/lib/logging';
import { BreadcrumbLabel } from '@/components/hub/breadcrumb-label';
import { TaskSheetProvider } from '@/components/hub/projects/task-sheet/task-sheet-host';
import { FeatureView } from '@/components/hub/projects/feature-view/feature-view';
import type { FeatureDetailDTO } from '@/components/hub/projects/feature-view/types';

export const metadata: Metadata = {
  title: 'Feature',
};

async function getFeature(id: string, key: string): Promise<FeatureDetailDTO | null> {
  try {
    const res = await serverFetch(
      `/api/v1/projects/${encodeURIComponent(id)}/features/${encodeURIComponent(key)}`
    );
    if (!res.ok) {
      // 404 is expected for a non-member / unknown feature (→ notFound); log the rest.
      if (res.status !== 404) {
        logger.error('Hub feature fetch failed', { id, key, status: res.status });
      }
      return null;
    }
    const data = await parseApiResponse<FeatureDetailDTO>(res);
    return data.success ? data.data : null;
  } catch (error) {
    logger.error('Hub feature fetch threw', { id, key, error });
    return null;
  }
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
      <TaskSheetProvider projectId={feature.projectId}>
        <FeatureView feature={feature} />
      </TaskSheetProvider>
    </>
  );
}
