/**
 * Workflow cost estimator (generic)
 *
 * Predicts the USD cost of running a workflow *before* it's triggered,
 * so trigger UIs can show a number near the action button. Any
 * workflow can use this service — the heuristic auto-derives from the
 * published workflow definition by counting LLM-producing steps, and
 * the empirical path uses past completed runs of the same workflow.
 *
 * Two modes, chosen by data availability:
 *
 *   - **empirical** — when ≥3 past completed runs match the supervisor
 *     toggle, we calibrate a token-shape ratio between the past actuals
 *     and the heuristic baseline, then reprice under the *current*
 *     chat-default + judge-model rates. Past runs on Sonnet still
 *     inform a future run on Haiku — token usage shape is reused,
 *     dollar amounts are not.
 *
 *   - **heuristic** — when fewer matching past runs exist, fall back to
 *     a workflow-aware shape: count the LLM-producing steps in the
 *     published definition, multiply by per-step token assumptions,
 *     and add a supervisor add-on when applicable. Range is widened
 *     (±50%) to signal the uncertainty.
 *
 * Supervisor cost is isolated by step *type* (any step with
 * `type === 'supervisor'`) so the estimator works for workflows whose
 * supervisor step id differs from the audit's `supervisor_review`.
 *
 * **Optional `itemCount`** — workflows whose cost scales with an input
 * dimension (e.g. the audit's selected-model count, a "process N
 * documents" pipeline) can pass `itemCount` to bump the heuristic and
 * surface that scaling in the estimate. Workflows without a scaling
 * input simply omit it.
 *
 * Past runs are capped at 100 most recent — workflows aren't hot enough
 * to need more; older runs would drag the estimate toward stale prompt
 * shapes anyway.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { getModel, refreshFromOpenRouter } from '@/lib/orchestration/llm/model-registry';
import { hydrateFromDb as hydrateModelRegistryFromDb } from '@/lib/orchestration/llm/model-registry-db-hydrate';
import { getDefaultModelForTaskOrNull } from '@/lib/orchestration/llm/settings-resolver';
import { JUDGE_MODEL } from '@/lib/orchestration/evaluations/judge-model';
import { workflowDefinitionSchema } from '@/lib/validations/orchestration';
import type { WorkflowDefinition } from '@/types/orchestration';

/**
 * Step types that incur per-step LLM token cost. Supervisor is tracked
 * separately because it runs against the (potentially different) judge
 * model. Non-LLM step types (tool_call, external_call, parallel,
 * send_notification, human_approval, rag_retrieve, report, chain) are
 * excluded — they have no LLM bill.
 */
const LLM_STEP_TYPES: ReadonlySet<string> = new Set([
  'llm_call',
  'agent_call',
  'evaluate',
  'guard',
  'reflect',
  'route',
  'plan',
  'orchestrator',
]);

const SUPERVISOR_STEP_TYPE = 'supervisor';

/**
 * Some step types internally loop or chain multiple LLM calls; the
 * heuristic counts them as N equivalents. Values are calibrated against
 * the audit workflow's actual trace and refined as new workflows hit
 * the empirical floor.
 */
const STEP_LLM_MULTIPLIERS: Record<string, number> = {
  agent_call: 3, // ~3 tool iterations average; capped at maxToolIterations
  reflect: 2, // draft + critique; iterates up to maxIterations
};

/**
 * Per-LLM-step heuristic token assumptions. The base values are calibrated
 * to mid-sized chat-completion prompts; the per-item bumps cover the
 * common case where a workflow's input list grows the prompts linearly.
 *
 * Verified against the provider-model-audit trace (13 LLM-producing
 * steps × ~3k input, ~1k output per step, + 800 per-model overhead in
 * the analyse / validate / refine / compile steps) — the workflow-shape
 * prediction matches the audit-specific constants the prior implementation
 * used.
 */
const HEURISTIC = {
  INPUT_TOKENS_PER_LLM_STEP: 3_000,
  OUTPUT_TOKENS_PER_LLM_STEP: 1_000,
  PER_ITEM_INPUT_TOKENS: 800,
  PER_ITEM_OUTPUT_TOKENS: 300,
  SUPERVISOR_INPUT_TOKENS: 18_000,
  SUPERVISOR_OUTPUT_TOKENS: 2_500,
} as const;

/**
 * Last-resort model id when neither `defaultModels.chat` nor the
 * registry has a usable entry. Used only to keep the dollar number from
 * collapsing to $0 in cold-start deployments.
 */
const FALLBACK_MODEL_ID = 'claude-sonnet-4-6';

/** Minimum matching past runs needed before we trust the empirical path. */
const EMPIRICAL_MIN_SAMPLES = 3;

/** Range bounds for the empirical estimate, expressed as fraction of mid. */
const EMPIRICAL_RANGE_MIN = 0.2;
const EMPIRICAL_RANGE_MAX = 0.6;

/** Pure-heuristic mode is rough; show a wide range. */
const HEURISTIC_LOW_MULT = 0.5;
const HEURISTIC_HIGH_MULT = 2.0;

export interface WorkflowCostEstimateModel {
  modelId: string;
  /** 'work' = non-supervisor LLM steps; 'supervisor' = supervisor step. */
  role: 'work' | 'supervisor';
  /** Tokens attributed to this model (after empirical calibration if applicable). */
  inputTokens: number;
  outputTokens: number;
  /** USD cost contribution at the current model rates. */
  costUsd: number;
  /**
   * Whether the registry has pricing data for `modelId`. False when
   * `getModel(modelId)` returns undefined — typically a model id that
   * isn't in the static fallback, isn't in the OpenRouter catalogue,
   * and has no matrix row supplying `costPerMillionTokens`. The cost
   * contribution is $0 in that case; the UI should surface it as
   * "pricing unknown" so the operator knows the overall estimate is
   * missing a slice rather than reading $0 as "free".
   */
  pricingKnown: boolean;
}

export interface WorkflowCostEstimate {
  midUsd: number;
  lowUsd: number;
  highUsd: number;
  basedOn: 'empirical' | 'heuristic';
  sampleSize: number;
  /**
   * Chat-default model used to price non-supervisor LLM steps that
   * don't carry a `modelOverride` and aren't `agent_call`s into agents
   * with their own bound model. Kept on the response for backward
   * compatibility — `modelMix` is the authoritative per-step breakdown.
   */
  modelUsed: string;
  /**
   * Judge model used to price the supervisor step.
   * Null when `supervisor: false`, when the workflow has no
   * supervisor step, or when the estimator was invoked without a
   * supervisor toggle.
   */
  judgeModelUsed: string | null;
  /**
   * Per-model token + cost breakdown. Captures step-level
   * `modelOverride` and the agent-bound model used by `agent_call`
   * steps — so an audit workflow that pins one step to gpt-5 prices
   * that step at gpt-5 even when the chat default is gpt-4o-mini.
   * Empty array when the workflow has no LLM steps at all.
   */
  modelMix: WorkflowCostEstimateModel[];
  /** Whether the workflow has a supervisor step at all. */
  workflowHasSupervisor: boolean;
  /** Count of LLM-producing steps in the workflow (excluding supervisor). */
  llmStepCount: number;
  /** Short explanation rendered in trigger-UI FieldHelp popovers. */
  notes: string;
}

interface PastRunSummary {
  /** itemCount derived from inputData.modelIds or a similar input array. */
  itemCount: number;
  supervisor: boolean;
  workInputTokens: number;
  workOutputTokens: number;
  supInputTokens: number;
  supOutputTokens: number;
}

/** Per-step model + LLM-call multiplier — drives per-model token allocation. */
interface StepModelEntry {
  stepId: string;
  type: string;
  modelId: string;
  /** STEP_LLM_MULTIPLIERS lookup; 1 for plain LLM steps. */
  multiplier: number;
}

interface WorkflowShape {
  llmStepCount: number;
  hasSupervisor: boolean;
  /** Step ids that have type 'supervisor' — used to split past run costs. */
  supervisorStepIds: ReadonlySet<string>;
  /**
   * One entry per non-supervisor LLM-producing step, in definition order,
   * with the model that step will use at runtime (modelOverride →
   * agent_call agent.model → chat default).
   */
  workSteps: StepModelEntry[];
  /** Resolved model for the (single) supervisor step, if any. */
  supervisorModelId: string | null;
}

interface PerModelTokens {
  inputTokens: number;
  outputTokens: number;
}

interface HeuristicTokens {
  /** Per-model token allocation for non-supervisor LLM steps. */
  workByModel: Map<string, PerModelTokens>;
  /** Aggregate tokens (sum across models) — used by the empirical ratio. */
  workInputTokens: number;
  workOutputTokens: number;
  /** Supervisor lives on a single model (judge), so a plain pair is enough. */
  supInputTokens: number;
  supOutputTokens: number;
}

function predictHeuristic(
  shape: WorkflowShape,
  itemCount: number,
  supervisor: boolean,
  chatModelId: string
): HeuristicTokens {
  const workByModel = new Map<string, PerModelTokens>();

  // Effective step count for the per-item bonus + the "at least one
  // step" floor. Workflows whose definition has no LLM-producing steps
  // (e.g. all non-LLM rag/tool pipelines) still produce a tiny heuristic
  // so the UI doesn't render "$0.00" as if the run is free; attribute
  // the floor to the chat default.
  const effectiveSteps = shape.workSteps.length > 0 ? shape.workSteps : null;
  const totalMultiplier = effectiveSteps
    ? effectiveSteps.reduce((sum, s) => sum + s.multiplier, 0)
    : 1;

  if (effectiveSteps) {
    for (const step of effectiveSteps) {
      bumpModel(
        workByModel,
        step.modelId,
        HEURISTIC.INPUT_TOKENS_PER_LLM_STEP * step.multiplier,
        HEURISTIC.OUTPUT_TOKENS_PER_LLM_STEP * step.multiplier
      );
    }
  } else {
    bumpModel(
      workByModel,
      chatModelId,
      HEURISTIC.INPUT_TOKENS_PER_LLM_STEP,
      HEURISTIC.OUTPUT_TOKENS_PER_LLM_STEP
    );
  }

  // Per-item scaling — distribute proportionally to each model's share
  // of the step-multiplier budget. Workflows whose itemCount scales
  // linearly across all steps (the common case, e.g. the audit's
  // "process N models") share the bump correctly; workflows whose
  // per-item work concentrates on one step still get a reasonable
  // approximation under this model.
  if (itemCount > 0 && totalMultiplier > 0) {
    for (const [modelId, tokens] of workByModel) {
      const share = modelMultiplierShare(modelId, effectiveSteps, totalMultiplier);
      tokens.inputTokens += HEURISTIC.PER_ITEM_INPUT_TOKENS * itemCount * share;
      tokens.outputTokens += HEURISTIC.PER_ITEM_OUTPUT_TOKENS * itemCount * share;
    }
  }

  let workInputTokens = 0;
  let workOutputTokens = 0;
  for (const { inputTokens, outputTokens } of workByModel.values()) {
    workInputTokens += inputTokens;
    workOutputTokens += outputTokens;
  }

  return {
    workByModel,
    workInputTokens,
    workOutputTokens,
    supInputTokens: supervisor && shape.hasSupervisor ? HEURISTIC.SUPERVISOR_INPUT_TOKENS : 0,
    supOutputTokens: supervisor && shape.hasSupervisor ? HEURISTIC.SUPERVISOR_OUTPUT_TOKENS : 0,
  };
}

function bumpModel(
  bucket: Map<string, PerModelTokens>,
  modelId: string,
  input: number,
  output: number
): void {
  const cur = bucket.get(modelId);
  if (cur) {
    cur.inputTokens += input;
    cur.outputTokens += output;
  } else {
    bucket.set(modelId, { inputTokens: input, outputTokens: output });
  }
}

function modelMultiplierShare(
  modelId: string,
  steps: StepModelEntry[] | null,
  totalMultiplier: number
): number {
  if (!steps || totalMultiplier === 0) return 1;
  let mult = 0;
  for (const step of steps) if (step.modelId === modelId) mult += step.multiplier;
  return mult / totalMultiplier;
}

/**
 * Scale a per-model token allocation in place. Returns the same map
 * (mutated) for caller convenience. `ratio === 1` is a no-op aside
 * from the allocation.
 */
function scalePerModel(
  bucket: Map<string, PerModelTokens>,
  ratio: number
): Map<string, PerModelTokens> {
  if (ratio === 1) return bucket;
  for (const tokens of bucket.values()) {
    tokens.inputTokens *= ratio;
    tokens.outputTokens *= ratio;
  }
  return bucket;
}

function priceTokens(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = getModel(modelId);
  if (!model) return 0;
  return (
    (inputTokens / 1_000_000) * model.inputCostPerMillion +
    (outputTokens / 1_000_000) * model.outputCostPerMillion
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Median absolute deviation as a fraction of the median. More robust
 * to outliers than std-dev/mean when N is small.
 */
function relativeMad(values: number[], centre: number): number {
  if (values.length === 0 || centre === 0) return 0;
  const devs = values.map((v) => Math.abs(v - centre));
  return median(devs) / centre;
}

export interface EstimateWorkflowCostInput {
  workflowId: string;
  /**
   * Optional caller-supplied multiplier for workflows whose cost scales
   * with an input dimension (e.g. number of models being audited, number
   * of documents being processed). Defaults to 0 — workflows without a
   * scaling input simply omit it.
   */
  itemCount?: number;
  /**
   * Whether the supervisor step should run for this estimate. Ignored
   * when the workflow has no supervisor step. Past runs are filtered
   * by their actual supervisor toggle (extracted from
   * `inputData.__runSupervisor`) so the calibration set matches.
   */
  supervisor?: boolean;
}

export async function estimateWorkflowCost(
  input: EstimateWorkflowCostInput
): Promise<WorkflowCostEstimate> {
  const { workflowId, itemCount = 0, supervisor = false } = input;

  // Warm the in-memory model registry before pricing. Without this,
  // a cost-estimate served before any other code path triggered the
  // lazy OpenRouter refresh sees an empty registry beyond the small
  // static fallback, and any operator-curated id (e.g. `gpt-5`) prices
  // to $0. Both helpers are heavily cached (24h / 60s TTLs), so the
  // cold path pays the network/DB cost once and every subsequent call
  // is a no-op. `allSettled` so a transient OR outage doesn't block
  // the DB hydration (and vice versa).
  await Promise.allSettled([refreshFromOpenRouter(), hydrateModelRegistryFromDb()]);

  const chatModelId = (await getDefaultModelForTaskOrNull('chat')) ?? FALLBACK_MODEL_ID;

  // Workflow shape — drives the heuristic + supervisor detection.
  // Resolves each LLM-producing step's model via the lookup chain
  // step.config.modelOverride → agent_call agent.model → chat default.
  const shape = await loadWorkflowShape(workflowId, chatModelId);
  const supervisorActive = supervisor && shape.hasSupervisor;
  const judgeModelId = supervisorActive
    ? (shape.supervisorModelId ?? JUDGE_MODEL ?? chatModelId)
    : null;

  const heuristic = predictHeuristic(shape, itemCount, supervisor, chatModelId);

  let pastRuns: PastRunSummary[] = [];
  try {
    pastRuns = await loadPastRuns(workflowId, shape.supervisorStepIds);
  } catch (err) {
    logger.warn('estimateWorkflowCost: past-runs query failed, falling back to heuristic', {
      workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Filter past runs to ones that match the requested supervisor toggle
  // *as long as the workflow even has a supervisor*. For workflows
  // without supervisor steps, the toggle is meaningless and we use all
  // past runs.
  const matchingRuns = shape.hasSupervisor
    ? pastRuns.filter((r) => r.supervisor === supervisor)
    : pastRuns;

  if (matchingRuns.length >= EMPIRICAL_MIN_SAMPLES) {
    return buildEmpiricalEstimate({
      shape,
      heuristic,
      matchingRuns,
      chatModelId,
      judgeModelId,
    });
  }

  return buildHeuristicEstimate({
    shape,
    heuristic,
    chatModelId,
    judgeModelId,
    sampleSize: matchingRuns.length,
  });
}

function buildEmpiricalEstimate(params: {
  shape: WorkflowShape;
  heuristic: HeuristicTokens;
  matchingRuns: PastRunSummary[];
  chatModelId: string;
  judgeModelId: string | null;
}): WorkflowCostEstimate {
  const { shape, heuristic, matchingRuns, chatModelId, judgeModelId } = params;

  // Per-run ratio between actual and heuristic prediction. The ratio
  // captures prompt-evolution and tokeniser drift in one number, then
  // gets applied uniformly across all per-model token buckets. Past
  // runs whose model mix differed from the current definition still
  // inform shape drift but don't shift the per-model attribution —
  // that's read from the *current* workflow definition.
  const workRatios: number[] = [];
  const supRatios: number[] = [];
  for (const run of matchingRuns) {
    const pred = predictHeuristic(shape, run.itemCount, run.supervisor, chatModelId);
    const actualWork = run.workInputTokens + run.workOutputTokens;
    const predWork = pred.workInputTokens + pred.workOutputTokens;
    if (predWork > 0 && actualWork > 0) workRatios.push(actualWork / predWork);

    if (run.supervisor) {
      const actualSup = run.supInputTokens + run.supOutputTokens;
      const predSup = pred.supInputTokens + pred.supOutputTokens;
      if (predSup > 0 && actualSup > 0) supRatios.push(actualSup / predSup);
    }
  }

  // Median is more robust than mean for small samples.
  const workRatio = workRatios.length > 0 ? median(workRatios) : 1;
  const supRatio = supRatios.length > 0 ? median(supRatios) : 1;

  const scaledWork = scalePerModel(cloneTokenMap(heuristic.workByModel), workRatio);
  const scaledSupInput = heuristic.supInputTokens * supRatio;
  const scaledSupOutput = heuristic.supOutputTokens * supRatio;

  const { midUsd, modelMix } = priceModelMix({
    workByModel: scaledWork,
    judgeModelId,
    supInputTokens: scaledSupInput,
    supOutputTokens: scaledSupOutput,
  });

  const rawSpread = relativeMad(workRatios, workRatio);
  const spread = Math.max(EMPIRICAL_RANGE_MIN, Math.min(rawSpread, EMPIRICAL_RANGE_MAX));

  return {
    midUsd,
    lowUsd: Math.max(0, midUsd * (1 - spread)),
    highUsd: midUsd * (1 + spread),
    basedOn: 'empirical',
    sampleSize: matchingRuns.length,
    modelUsed: chatModelId,
    judgeModelUsed: judgeModelId,
    modelMix,
    workflowHasSupervisor: shape.hasSupervisor,
    llmStepCount: shape.llmStepCount,
    notes: `Calibrated from ${matchingRuns.length} past run${
      matchingRuns.length === 1 ? '' : 's'
    } — token usage repriced at current per-model rates.`,
  };
}

function buildHeuristicEstimate(params: {
  shape: WorkflowShape;
  heuristic: HeuristicTokens;
  chatModelId: string;
  judgeModelId: string | null;
  sampleSize: number;
}): WorkflowCostEstimate {
  const { shape, heuristic, chatModelId, judgeModelId, sampleSize } = params;

  const { midUsd, modelMix } = priceModelMix({
    workByModel: cloneTokenMap(heuristic.workByModel),
    judgeModelId,
    supInputTokens: heuristic.supInputTokens,
    supOutputTokens: heuristic.supOutputTokens,
  });

  return {
    midUsd,
    lowUsd: midUsd * HEURISTIC_LOW_MULT,
    highUsd: midUsd * HEURISTIC_HIGH_MULT,
    basedOn: 'heuristic',
    sampleSize,
    modelUsed: chatModelId,
    judgeModelUsed: judgeModelId,
    modelMix,
    workflowHasSupervisor: shape.hasSupervisor,
    llmStepCount: shape.llmStepCount,
    notes:
      sampleSize === 0
        ? `No prior runs — estimate is a heuristic from this workflow's shape (${shape.llmStepCount} LLM-producing step${
            shape.llmStepCount === 1 ? '' : 's'
          }).`
        : `Only ${sampleSize} prior run${
            sampleSize === 1 ? '' : 's'
          } with this supervisor setting — heuristic used until ${EMPIRICAL_MIN_SAMPLES}+ are available.`,
  };
}

/**
 * Price each model's token allocation independently and assemble the
 * `modelMix` array. A model that resolves to a registry entry with
 * zero pricing (unknown id, free-tier local model) contributes $0 but
 * still appears in the mix so the operator can see *which* model the
 * estimator considered — surfacing the unknown explicitly beats
 * silently dropping the row.
 */
function priceModelMix(params: {
  workByModel: Map<string, PerModelTokens>;
  judgeModelId: string | null;
  supInputTokens: number;
  supOutputTokens: number;
}): { midUsd: number; modelMix: WorkflowCostEstimateModel[] } {
  const { workByModel, judgeModelId, supInputTokens, supOutputTokens } = params;
  const modelMix: WorkflowCostEstimateModel[] = [];
  let midUsd = 0;

  for (const [modelId, tokens] of workByModel) {
    const pricingKnown = isModelPriced(modelId);
    const cost = priceTokens(modelId, tokens.inputTokens, tokens.outputTokens);
    midUsd += cost;
    modelMix.push({
      modelId,
      role: 'work',
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      costUsd: cost,
      pricingKnown,
    });
  }

  if (judgeModelId && (supInputTokens > 0 || supOutputTokens > 0)) {
    const pricingKnown = isModelPriced(judgeModelId);
    const cost = priceTokens(judgeModelId, supInputTokens, supOutputTokens);
    midUsd += cost;
    modelMix.push({
      modelId: judgeModelId,
      role: 'supervisor',
      inputTokens: supInputTokens,
      outputTokens: supOutputTokens,
      costUsd: cost,
      pricingKnown,
    });
  }

  return { midUsd, modelMix };
}

/**
 * A model is "priced" when the registry has a row for it AND that row
 * carries non-zero pricing. A zero-cost registry entry (e.g. a local
 * provider with no operator-supplied rate) is still treated as unknown
 * for UI purposes — a $0 estimate masquerading as accurate is worse
 * than an explicit "pricing unknown" callout.
 */
function isModelPriced(modelId: string): boolean {
  const m = getModel(modelId);
  if (!m) return false;
  return m.inputCostPerMillion > 0 || m.outputCostPerMillion > 0;
}

function cloneTokenMap(src: Map<string, PerModelTokens>): Map<string, PerModelTokens> {
  const dst = new Map<string, PerModelTokens>();
  for (const [k, v] of src) dst.set(k, { ...v });
  return dst;
}

/**
 * Read the workflow's published definition and derive its cost shape:
 *   - count of LLM-producing steps (excludes supervisor — tracked separately)
 *   - whether there's a supervisor step
 *   - set of supervisor step ids for splitting past run costs
 *
 * Returns a degenerate shape (1 LLM step, no supervisor) if the row
 * can't be loaded or the definition fails schema validation — better
 * to surface a low-confidence estimate than crash the dialog.
 */
async function loadWorkflowShape(
  workflowId: string,
  chatDefaultModelId: string
): Promise<WorkflowShape> {
  try {
    const workflow = await prisma.aiWorkflow.findUnique({
      where: { id: workflowId },
      select: { publishedVersion: { select: { snapshot: true } } },
    });

    const snapshot = workflow?.publishedVersion?.snapshot;
    if (!snapshot) return degenerateShape(chatDefaultModelId);

    const parsed = workflowDefinitionSchema.safeParse(snapshot);
    if (!parsed.success) {
      logger.warn('loadWorkflowShape: definition failed schema validation', {
        workflowId,
        issues: parsed.error.issues.length,
      });
      return degenerateShape(chatDefaultModelId);
    }

    return await summariseShape(parsed.data, chatDefaultModelId);
  } catch (err) {
    logger.warn('loadWorkflowShape: query failed', {
      workflowId,
      error: err instanceof Error ? err.message : String(err),
    });
    return degenerateShape(chatDefaultModelId);
  }
}

function degenerateShape(_chatDefaultModelId: string): WorkflowShape {
  return {
    llmStepCount: 1,
    hasSupervisor: false,
    supervisorStepIds: new Set(),
    workSteps: [],
    supervisorModelId: null,
  };
}

export async function summariseShape(
  definition: WorkflowDefinition,
  chatDefaultModelId: string
): Promise<WorkflowShape> {
  const supervisorStepIds = new Set<string>();
  const workSteps: StepModelEntry[] = [];
  let supervisorModelId: string | null = null;
  let supervisorOverride: string | null = null;

  // First pass: collect agent slugs we need to resolve and detect the
  // supervisor step. The supervisor's modelOverride wins; otherwise the
  // engine resolves to JUDGE_MODEL at runtime, which we honour
  // separately in `estimateWorkflowCost`.
  const agentSlugs = new Set<string>();
  for (const step of definition.steps) {
    if (step.type === SUPERVISOR_STEP_TYPE) {
      supervisorStepIds.add(step.id);
      const override = readModelOverride(step.config);
      if (override) supervisorOverride = override;
      continue;
    }
    if (!LLM_STEP_TYPES.has(step.type)) continue;
    if (step.type === 'agent_call' && !readModelOverride(step.config)) {
      const slug = readAgentSlug(step.config);
      if (slug) agentSlugs.add(slug);
    }
  }

  // Resolve agent slugs → bound model in one round-trip. Agents
  // without a bound `model` (rare; the form requires it) fall back to
  // the chat default.
  const agentModelBySlug = await loadAgentModels(agentSlugs);

  // Second pass: build the per-step entry list using resolved data.
  for (const step of definition.steps) {
    if (step.type === SUPERVISOR_STEP_TYPE) continue;
    if (!LLM_STEP_TYPES.has(step.type)) continue;

    const override = readModelOverride(step.config);
    let modelId: string;
    if (override) {
      modelId = override;
    } else if (step.type === 'agent_call') {
      const slug = readAgentSlug(step.config);
      const bound = slug ? agentModelBySlug.get(slug) : null;
      modelId = bound ?? chatDefaultModelId;
    } else {
      modelId = chatDefaultModelId;
    }

    workSteps.push({
      stepId: step.id,
      type: step.type,
      modelId,
      multiplier: STEP_LLM_MULTIPLIERS[step.type] ?? 1,
    });
  }

  const llmStepCount = workSteps.reduce((sum, s) => sum + s.multiplier, 0);
  supervisorModelId = supervisorOverride;

  return {
    llmStepCount,
    hasSupervisor: supervisorStepIds.size > 0,
    supervisorStepIds,
    workSteps,
    supervisorModelId,
  };
}

function readModelOverride(config: Record<string, unknown>): string | null {
  const val = config.modelOverride;
  return typeof val === 'string' && val.length > 0 ? val : null;
}

function readAgentSlug(config: Record<string, unknown>): string | null {
  const val = config.agentSlug;
  return typeof val === 'string' && val.length > 0 ? val : null;
}

async function loadAgentModels(slugs: Set<string>): Promise<Map<string, string | null>> {
  if (slugs.size === 0) return new Map();
  try {
    const rows = await prisma.aiAgent.findMany({
      where: { slug: { in: Array.from(slugs) } },
      select: { slug: true, model: true },
    });
    const result = new Map<string, string | null>();
    for (const row of rows) {
      result.set(row.slug, row.model && row.model.length > 0 ? row.model : null);
    }
    return result;
  } catch (err) {
    logger.warn('loadAgentModels: query failed', {
      slugs: Array.from(slugs),
      error: err instanceof Error ? err.message : String(err),
    });
    return new Map();
  }
}

async function loadPastRuns(
  workflowId: string,
  supervisorStepIds: ReadonlySet<string>
): Promise<PastRunSummary[]> {
  const executions = await prisma.aiWorkflowExecution.findMany({
    where: { workflowId, status: 'completed' },
    select: { id: true, inputData: true },
    orderBy: { completedAt: 'desc' },
    take: 100,
  });

  if (executions.length === 0) return [];

  const executionIds = executions.map((e) => e.id);
  const costLogs = await prisma.aiCostLog.findMany({
    where: { workflowExecutionId: { in: executionIds } },
    select: {
      workflowExecutionId: true,
      inputTokens: true,
      outputTokens: true,
      metadata: true,
    },
  });

  // Aggregate per execution, splitting supervisor steps from the rest.
  interface Aggregate {
    workInput: number;
    workOutput: number;
    supInput: number;
    supOutput: number;
  }
  const byExecution = new Map<string, Aggregate>();
  for (const row of costLogs) {
    if (!row.workflowExecutionId) continue;
    const stepId = readStepId(row.metadata);
    const isSupervisor = stepId !== undefined && supervisorStepIds.has(stepId);

    const agg = byExecution.get(row.workflowExecutionId) ?? {
      workInput: 0,
      workOutput: 0,
      supInput: 0,
      supOutput: 0,
    };
    if (isSupervisor) {
      agg.supInput += row.inputTokens;
      agg.supOutput += row.outputTokens;
    } else {
      agg.workInput += row.inputTokens;
      agg.workOutput += row.outputTokens;
    }
    byExecution.set(row.workflowExecutionId, agg);
  }

  const summaries: PastRunSummary[] = [];
  for (const exec of executions) {
    const agg = byExecution.get(exec.id);
    if (!agg) continue;
    const totals = agg.workInput + agg.workOutput + agg.supInput + agg.supOutput;
    if (totals === 0) continue;

    const parsed = parseInputData(exec.inputData);
    summaries.push({
      itemCount: parsed.itemCount,
      supervisor: parsed.supervisor,
      workInputTokens: agg.workInput,
      workOutputTokens: agg.workOutput,
      supInputTokens: agg.supInput,
      supOutputTokens: agg.supOutput,
    });
  }

  return summaries;
}

function readStepId(metadata: unknown): string | undefined {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>).stepId;
  return typeof value === 'string' ? value : undefined;
}

interface ParsedInputData {
  /**
   * Best-effort itemCount from common conventional input shapes.
   * Returns 0 when no recognisable list field is present — generic
   * workflows that pass arbitrary input still calibrate via the
   * aggregate token totals, just without per-item scaling.
   */
  itemCount: number;
  supervisor: boolean;
}

/**
 * Extract calibration-relevant fields from a past execution's inputData.
 *
 * Looks for common list fields by name (`modelIds`, `items`, `inputs`,
 * `ids`) and uses the first non-empty array's length as the item count.
 * Workflows that store their inputs under a different name simply get
 * `itemCount: 0` — they still calibrate from aggregate token totals,
 * the per-item heuristic just doesn't fire.
 *
 * `supervisor` follows the engine's strict equality: only the literal
 * boolean `false` opts out; anything else (undefined, null, string
 * `'false'`, `0`) means the supervisor ran.
 */
export function parseInputData(raw: unknown): ParsedInputData {
  const fallback: ParsedInputData = { itemCount: 0, supervisor: true };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;

  let itemCount = 0;
  for (const key of ['modelIds', 'items', 'inputs', 'ids'] as const) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0) {
      itemCount = val.length;
      break;
    }
  }
  return {
    itemCount,
    supervisor: obj.__runSupervisor !== false,
  };
}
