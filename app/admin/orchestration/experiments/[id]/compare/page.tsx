/**
 * /admin/orchestration/experiments/[id]/compare
 *
 * Server-rendered side-by-side comparison of every variant's
 * AiEvaluationRun summary. Per metric, computes Welch's t-test +
 * Cohen's d against the control variant (variant index 0) and renders
 * a winner badge when all three thresholds pass.
 *
 * Only meaningful for dataset-driven experiments (Phase 2.4 onward).
 * Legacy session-based experiments will see "no comparison data" and a
 * pointer to the run-detail page.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/utils';
import { VariantCompareTable } from '@/components/admin/orchestration/experiments/variant-compare-table';

export const metadata: Metadata = {
  title: 'Compare variants · AI Orchestration',
  description: 'Side-by-side per-metric comparison of experiment variants.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

interface RawScores {
  [graderSlug: string]: number[];
}

interface VariantRow {
  variantId: string;
  label: string;
  evaluationRunId: string | null;
  runStatus: string | null;
  rawScores: RawScores;
  meanByMetric: Record<string, number | null>;
}

async function loadExperiment(
  id: string,
  userId: string
): Promise<{
  experimentName: string;
  variants: VariantRow[];
  metricSlugs: string[];
} | null> {
  const experiment = await prisma.aiExperiment.findUnique({
    where: { id },
    include: {
      variants: {
        include: {
          evaluationRun: {
            select: {
              id: true,
              status: true,
              summary: true,
            },
          },
        },
      },
      creator: { select: { id: true } },
    },
  });
  if (!experiment) return null;
  // Ownership: only the creator can compare (admin-only page; this is
  // belt-and-braces with the route guard).
  if (experiment.createdBy !== userId) return null;

  const allMetricSlugs = new Set<string>();
  const variants: VariantRow[] = experiment.variants.map((v) => {
    const summary = (v.evaluationRun?.summary as Record<string, unknown> | null) ?? null;
    const rawScores = readRawScores(summary);
    const meanByMetric: Record<string, number | null> = {};
    const stats = (summary?.stats as Record<string, { mean?: number | null }> | undefined) ?? {};
    for (const [slug, raw] of Object.entries(rawScores)) {
      allMetricSlugs.add(slug);
      meanByMetric[slug] =
        typeof stats[slug]?.mean === 'number' ? (stats[slug]?.mean ?? null) : meanOrNull(raw);
    }
    return {
      variantId: v.id,
      label: v.label,
      evaluationRunId: v.evaluationRunId,
      runStatus: v.evaluationRun?.status ?? null,
      rawScores,
      meanByMetric,
    };
  });

  return {
    experimentName: experiment.name,
    variants,
    metricSlugs: Array.from(allMetricSlugs).sort(),
  };
}

function readRawScores(summary: Record<string, unknown> | null): RawScores {
  if (!summary || typeof summary !== 'object') return {};
  const raw = (summary as { rawScores?: unknown }).rawScores;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: RawScores = {};
  for (const [slug, scores] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(scores)) {
      const numeric = scores.filter(
        (s): s is number => typeof s === 'number' && Number.isFinite(s)
      );
      if (numeric.length > 0) result[slug] = numeric;
    }
  }
  return result;
}

function meanOrNull(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

export default async function ExperimentComparePage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const session = await requireRole('ADMIN');
  const { id } = await params;

  const data = await loadExperiment(id, session.user.id);
  if (!data) notFound();

  const noRunsYet = data.variants.every((v) => v.evaluationRunId === null);
  const someRunsStillQueued = data.variants.some(
    (v) => v.evaluationRunId !== null && v.runStatus !== 'completed'
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/orchestration/evaluations?tab=experiments">
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
              Back to experiments
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{data.experimentName}</h1>
          <p className="text-muted-foreground text-sm">
            Side-by-side comparison of {data.variants.length} variant
            {data.variants.length === 1 ? '' : 's'} · {data.metricSlugs.length} metric
            {data.metricSlugs.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {noRunsYet ? (
        <Card>
          <CardHeader>
            <CardTitle>No comparison data yet</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            This experiment hasn&apos;t been run, or it ran via the legacy evaluation-session path.
            Dataset-driven runs produce the per-metric raw scores the compare view uses for
            Welch&apos;s t-test and Cohen&apos;s d.
          </CardContent>
        </Card>
      ) : (
        <>
          {someRunsStillQueued ? (
            <Card>
              <CardContent className="text-muted-foreground py-3 text-sm">
                Some variant runs are still queued or running. Stats below are computed against
                whatever has completed so far — refresh once all variants finish for the final
                comparison.
              </CardContent>
            </Card>
          ) : null}
          <VariantCompareTable variants={data.variants} metricSlugs={data.metricSlugs} />
        </>
      )}
    </div>
  );
}
