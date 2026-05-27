'use client';

/**
 * PairwiseVerdictCard — compare-view side panel for the experiment's
 * pairwise judge tally. Renders the stored verdict if one has been
 * computed, plus a button that opens a Dialog to run a new one.
 *
 * Submitting POSTs to `/api/v1/admin/orchestration/experiments/:id/verdicts`,
 * which streams the judge across both variants' per-case outputs and
 * persists the result back on `AiExperiment.pairwiseVerdict`. The card
 * calls `router.refresh()` on success so the parent server component
 * re-renders with the new tally.
 *
 * Capped at 100 cases — the button is disabled with help text above
 * the cap; the server enforces the cap too via a 409 ConflictError.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ScaleIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { API } from '@/lib/api/endpoints';
import type { PairwiseVerdictSummary } from '@/types/orchestration';

const MAX_CASES_FOR_SYNC = 100;

export interface JudgeOption {
  slug: string;
  name: string;
}

export interface VariantOption {
  variantId: string;
  label: string;
  evaluationRunId: string | null;
  runStatus: string | null;
}

interface PairwiseVerdictCardProps {
  experimentId: string;
  /** Stored verdict from `AiExperiment.pairwiseVerdict`, or null. */
  verdict: PairwiseVerdictSummary | null;
  /** Active judge agents the operator can pick. Filtered to kind='judge'. */
  judges: JudgeOption[];
  /** All variants on this experiment, in display order (control first). */
  variants: VariantOption[];
  /** Dataset case count — drives the 100-cap gate. Null = no dataset. */
  caseCount: number | null;
}

type ApiSuccess<T> = { success: true; data: T };
type ApiError = { success: false; error: { message: string } };

export function PairwiseVerdictCard({
  experimentId,
  verdict,
  judges,
  variants,
  caseCount,
}: PairwiseVerdictCardProps): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pickable defaults: variant A = control (index 0), variant B = first
  // other variant. Judge defaults to the prior run's judge when present,
  // else the first available.
  const completedVariants = variants.filter(
    (v) => v.evaluationRunId !== null && v.runStatus === 'completed'
  );
  const defaultAId = verdict?.variantAId ?? completedVariants[0]?.variantId ?? '';
  const defaultBId =
    verdict?.variantBId ??
    completedVariants.find((v) => v.variantId !== defaultAId)?.variantId ??
    '';
  const defaultJudge = verdict?.judgeAgentSlug ?? judges[0]?.slug ?? '';

  const [variantAId, setVariantAId] = React.useState(defaultAId);
  const [variantBId, setVariantBId] = React.useState(defaultBId);
  const [judgeSlug, setJudgeSlug] = React.useState(defaultJudge);

  const overCap = caseCount !== null && caseCount > MAX_CASES_FOR_SYNC;
  const noDataset = caseCount === null;
  const tooFewVariants = completedVariants.length < 2;
  const buttonDisabled = overCap || noDataset || tooFewVariants || judges.length === 0;

  const labelByVariantId = new Map(variants.map((v) => [v.variantId, v.label]));

  async function handleSubmit(): Promise<void> {
    if (!judgeSlug || !variantAId || !variantBId) {
      setError('Pick a judge and two distinct variants.');
      return;
    }
    if (variantAId === variantBId) {
      setError('Variants A and B must be different.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(API.ADMIN.ORCHESTRATION.experimentVerdictsById(experimentId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judgeAgentSlug: judgeSlug, variantAId, variantBId }),
      });
      const payload = (await res.json()) as ApiSuccess<PairwiseVerdictSummary> | ApiError;
      if (!res.ok || !payload.success) {
        setError(!payload.success ? payload.error.message : `Failed (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <ScaleIcon className="text-muted-foreground h-4 w-4" aria-hidden />
          <CardTitle className="text-sm">Pairwise verdict</CardTitle>
        </div>
        <Button
          size="sm"
          variant={verdict ? 'outline' : 'default'}
          disabled={buttonDisabled}
          onClick={() => setOpen(true)}
        >
          {verdict ? 'Re-run verdict' : 'Run verdict'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {verdict ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge
                label={`${labelByVariantId.get(verdict.variantAId) ?? 'A'} wins`}
                count={verdict.counts.A}
                emphasis={verdict.counts.A > verdict.counts.B}
              />
              <VerdictBadge
                label={`${labelByVariantId.get(verdict.variantBId) ?? 'B'} wins`}
                count={verdict.counts.B}
                emphasis={verdict.counts.B > verdict.counts.A}
              />
              <VerdictBadge label="Ties" count={verdict.counts.tie} />
              {verdict.casesFailed > 0 ? (
                <VerdictBadge label="Failed" count={verdict.casesFailed} muted />
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              Judge: <span className="font-mono">{verdict.judgeAgentSlug}</span> ·{' '}
              {verdict.casesScored} cases scored · {new Date(verdict.computedAt).toLocaleString()}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {tooFewVariants
              ? 'Both variants need a completed evaluation run before a pairwise verdict can be computed.'
              : noDataset
                ? 'This experiment has no dataset — pairwise verdicts need dataset-driven variants.'
                : overCap
                  ? `Pairwise verdicts cap at ${MAX_CASES_FOR_SYNC} cases. This dataset has ${caseCount}. Use a smaller dataset to compare.`
                  : 'No verdict yet. Pick a judge agent to score both variants side-by-side, one case at a time.'}
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !submitting && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run pairwise verdict</DialogTitle>
            <DialogDescription>
              Drives the chosen judge agent across every case, showing both variants&apos; answers
              side-by-side, and tallies the verdicts. One judge LLM call per case — keep an eye on
              cost for larger datasets.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="verdict-judge">Judge agent</Label>
              <Select value={judgeSlug} onValueChange={setJudgeSlug}>
                <SelectTrigger id="verdict-judge">
                  <SelectValue placeholder="Pick a judge agent" />
                </SelectTrigger>
                <SelectContent>
                  {judges.map((j) => (
                    <SelectItem key={j.slug} value={j.slug}>
                      {j.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="verdict-a">Variant A</Label>
                <Select value={variantAId} onValueChange={setVariantAId}>
                  <SelectTrigger id="verdict-a">
                    <SelectValue placeholder="Pick variant A" />
                  </SelectTrigger>
                  <SelectContent>
                    {completedVariants.map((v) => (
                      <SelectItem key={v.variantId} value={v.variantId}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="verdict-b">Variant B</Label>
                <Select value={variantBId} onValueChange={setVariantBId}>
                  <SelectTrigger id="verdict-b">
                    <SelectValue placeholder="Pick variant B" />
                  </SelectTrigger>
                  <SelectContent>
                    {completedVariants.map((v) => (
                      <SelectItem key={v.variantId} value={v.variantId}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {error ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
              Run verdict
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function VerdictBadge({
  label,
  count,
  emphasis,
  muted,
}: {
  label: string;
  count: number;
  emphasis?: boolean;
  muted?: boolean;
}): React.ReactElement {
  const variant = muted ? 'outline' : emphasis ? 'default' : 'secondary';
  return (
    <Badge variant={variant} className="text-xs">
      {label}: {count}
    </Badge>
  );
}
