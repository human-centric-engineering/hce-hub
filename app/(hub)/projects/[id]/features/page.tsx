import { redirect } from 'next/navigation';

/**
 * `/projects/<id>/features` — no index of its own (features live in the project's
 * Plan). Redirects back to the project so the feature-page breadcrumb's
 * intermediate "Features" crumb is a live link, not a dead end
 * (f-feature-planning §18 t-3).
 */
export default async function FeaturesIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
