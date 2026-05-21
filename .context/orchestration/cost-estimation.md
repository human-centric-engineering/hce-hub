# Workflow Cost Estimation

Predicts the USD cost of running a workflow **before** it's triggered, so trigger UIs can render an "Estimated cost ~$X.XX" indicator next to the action button. The service is **generic** — any workflow can use it. The Audit Models dialog is one consumer; others can wire up identically.

## When to use this

- **Trigger UIs** that want to show the operator a cost before they click "Run" — particularly useful when the workflow involves several LLM steps, a supervisor pass, or scales with an input list (number of items to process).
- **Cost-budget gates** where the dialog should warn before submission ("This run is estimated at $5; continue?").
- **Analytics surfaces** that want a rough "what would re-running this cost today?" number.

Don't use it for billing, quotes, or hard caps — the estimator is **planning-grade**. Real cost varies with prompt evolution, retry behaviour on validation guards, agent tool-use iterations, and supervisor-judge response length. Use `AiCostLog` aggregates for actuals.

**Related to but distinct from the per-execution cap (`AiWorkflow.maxCostPerExecutionUsd`).** That cap is the enforced runtime ceiling (improvement #39 — see `.context/orchestration/engine.md`); the estimator is the pre-flight prediction. A trigger UI can compare the estimate against the resolved cap and warn before submission ("Estimated $5.20 — exceeds the workflow's $2.00 cap; the run will likely fail mid-way"). Not yet wired into the admin estimator endpoint; consumers that want this can read `AiWorkflow.maxCostPerExecutionUsd` themselves and compare.

## How it works

The estimator picks one of two modes based on data availability for the specific workflow:

| Mode          | Trigger                                                      | What it does                                                                                                                                                                | Range                           |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **empirical** | ≥3 past completed runs match the requested supervisor toggle | Computes a token-shape ratio between past actuals and the heuristic baseline, applies it to the heuristic, then reprices under the current chat-default + judge-model rates | MAD-derived, clamped to ±20–60% |
| **heuristic** | <3 matching past runs                                        | Counts LLM-producing steps in the published workflow definition, multiplies by per-step token assumptions, adds a supervisor add-on if applicable                           | ±50%                            |

### Repricing under current rates

This is the load-bearing trick: past run token _usage_ is preserved, but **dollar amounts are recomputed at the workflow's currently-configured chat default and judge model**. So a past run on Sonnet still informs a future run on Haiku — token shape carries over, pricing doesn't. This means you can switch the chat default model without invalidating accumulated calibration history.

### Registry warmup

`estimateWorkflowCost` calls `refreshFromOpenRouter()` and `hydrateFromDb()` (via `Promise.allSettled`) before pricing. Both are heavily cached (24h / 60s TTLs) so the cost is paid once per process — the cold first-call path takes ~500ms-2s, every subsequent estimate is instant. Without the warmup, a cost-estimate served before any other code path (the chat path, the provider-models endpoint, a workflow execute) triggered the lazy OpenRouter refresh sees only the small static fallback catalogue, and any operator-curated model id prices to $0. The `allSettled` guard means a transient OR outage or DB blip degrades the estimate to whatever the registry already had instead of failing the dialog.

### Per-step model resolution

LLM-producing steps don't all run on the chat default — a step can pin its own model via `config.modelOverride`, and `agent_call` steps inherit the bound model on the referenced agent. The estimator walks the published workflow definition and resolves each step's model under the chain:

1. `step.config.modelOverride` (string) → use that
2. `agent_call` → look up the agent's `model` via `AiAgent.findMany({ where: { slug: { in: ... } } })`
3. Fallback to the chat default

Tokens are then allocated to each model's bucket (one bucket per distinct model id), the per-item bonus is distributed pro-rata by the model's share of the step-multiplier budget, and each bucket is priced separately at its model's current rate. The supervisor step uses its own `modelOverride` (if set) → `JUDGE_MODEL` env var → chat default chain.

The response exposes this as `modelMix: WorkflowCostEstimateModel[]` — one entry per (model, role) pair with `inputTokens`, `outputTokens`, and `costUsd`. UIs surface this in a FieldHelp breakdown so an operator can see exactly which model is driving the estimate; that matters when a workflow pins one expensive step (e.g. validation on gpt-5 inside a default-Haiku pipeline).

### Heuristic shape detection

The heuristic auto-derives from the workflow's published definition:

- **LLM-producing step types** (counted toward `llmStepCount`): `llm_call`, `agent_call`, `evaluate`, `guard`, `reflect`, `route`, `plan`, `orchestrator`
- **Multipliers for looping step types**:
  - `agent_call` → counts as 3 LLM calls (averages 3 tool iterations, capped at `maxToolIterations`)
  - `reflect` → counts as 2 LLM calls (draft + critique, may iterate further up to `maxIterations`)
- **Supervisor**: `supervisor`-typed steps are tracked separately. Cost = a fixed token budget priced against `JUDGE_MODEL` (falls through to chat default when env var unset)
- **Non-LLM step types** (excluded): `tool_call`, `external_call`, `parallel`, `send_notification`, `human_approval`, `rag_retrieve`, `report`, `chain`

Heuristic constants live in `lib/orchestration/cost-estimation/workflow-cost.ts`:

```ts
INPUT_TOKENS_PER_LLM_STEP = 3_000;
OUTPUT_TOKENS_PER_LLM_STEP = 1_000;
PER_ITEM_INPUT_TOKENS = 800; // scales with itemCount
PER_ITEM_OUTPUT_TOKENS = 300;
SUPERVISOR_INPUT_TOKENS = 18_000;
SUPERVISOR_OUTPUT_TOKENS = 2_500;
```

### Supervisor cost isolation in the empirical path

Past `AiCostLog` rows carry the originating `stepId` in `metadata.stepId`. The estimator reads the workflow's current published definition, identifies which step ids have `type: 'supervisor'`, and uses that set to split past run costs into "work" vs "supervisor" buckets. This means workflows whose supervisor step is named `supervisor_review` (the audit) and workflows whose supervisor step is named anything else are handled identically — there's no hard-coded step id.

## API

### Endpoint

```
GET /api/v1/admin/orchestration/workflows/:id/cost-estimate
  ?itemCount=N&supervisor=true|false
```

**Query params (both optional):**

- `itemCount` — integer 0–10,000. Caller-supplied multiplier for workflows whose cost scales with an input dimension (e.g. number of models being audited, number of documents being processed). Omit (or pass 0) for workflows without a scaling input.
- `supervisor` — `true` | `false`. Whether the supervisor will run for this estimate. Ignored when the workflow has no supervisor step. Past runs are filtered by the supervisor flag stored in `inputData.__runSupervisor` to keep the calibration set apples-to-apples.

**Response:**

```ts
interface WorkflowCostEstimateModel {
  modelId: string;
  role: 'work' | 'supervisor';
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  pricingKnown: boolean; // false when getModel(modelId) returns undefined or has zero pricing — UI should render "pricing unknown" instead of $0
}

interface WorkflowCostEstimate {
  midUsd: number;
  lowUsd: number;
  highUsd: number;
  basedOn: 'empirical' | 'heuristic';
  sampleSize: number;
  modelUsed: string; // chat default — kept for backward compat; modelMix is authoritative
  judgeModelUsed: string | null; // judge model used for the supervisor step (null when supervisor inactive)
  modelMix: WorkflowCostEstimateModel[]; // per-(model, role) breakdown — includes modelOverride + agent-bound models
  workflowHasSupervisor: boolean;
  llmStepCount: number;
  notes: string;
}
```

**Authentication:** Admin role required. Rate-limited via `adminLimiter`.

### Programmatic use (server-side)

```ts
import { estimateWorkflowCost } from '@/lib/orchestration/cost-estimation/workflow-cost';

const estimate = await estimateWorkflowCost({
  workflowId,
  itemCount: 5, // optional
  supervisor: true, // optional
});
```

Returns the same `WorkflowCostEstimate` shape as the HTTP endpoint.

## Integrating a new trigger UI

To add a cost estimate to a workflow trigger dialog:

1. **Fetch the workflow id** on dialog open (most dialogs already do this to call `/execute`). Cache it in state so estimate + submit reuse the lookup.
2. **Fetch the estimate** when the relevant inputs change, debounced. Inputs that should refetch:
   - `itemCount` if the workflow scales with an input list
   - `supervisor` if the workflow has a supervisor step
3. **Render the estimate row** near the trigger button, e.g. above the dialog footer:

   ```tsx
   {
     estimate && (
       <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
         <span>
           Estimated cost: <strong>~{formatUsd(estimate.midUsd)}</strong> (range{' '}
           {formatUsd(estimate.lowUsd)}–{formatUsd(estimate.highUsd)})
         </span>
         <FieldHelp title="How the cost is estimated">
           <p>{estimate.notes}</p>
           <p>
             Priced for <code>{estimate.modelUsed}</code>
             {estimate.judgeModelUsed && (
               <>
                 {' '}
                 · supervisor: <code>{estimate.judgeModelUsed}</code>
               </>
             )}
             .
           </p>
         </FieldHelp>
       </div>
     );
   }
   ```

4. **Show the model mix** in the FieldHelp popover — iterate `estimate.modelMix` and render one row per entry (`<code>{m.modelId}</code> — {formatUsd(m.costUsd)}`, suffix with `(supervisor)` when `m.role === 'supervisor'`). When `m.pricingKnown === false`, render "pricing unknown" (in an amber/warning colour) instead of `$0.00` and add a footnote pointing at the matrix row that needs `costPerMillionTokens` filled in — silent $0 reads as "free" to operators. For workflows that pin one step to an expensive model (or use agent_call into a frontier agent), the breakdown is the only way the operator sees that contribution. The legacy `estimate.modelUsed` field still resolves to the chat default and is fine to mention as a sentence under the list ("Other steps fall back to the chat default `<modelUsed>`.").
5. **Treat the number as planning-grade.** Don't gate the action button on it. The estimator returns silently if the past-runs query fails — the dialog should still let the operator proceed.

## Reference implementation

[`components/admin/orchestration/audit-models-dialog.tsx`](../../components/admin/orchestration/audit-models-dialog.tsx) is the canonical consumer. It passes `itemCount = selected.size` (the number of models being audited) and toggles `supervisor` based on the dialog's neutral-review checkbox.

## Files

- `lib/orchestration/cost-estimation/workflow-cost.ts` — service implementation
- `app/api/v1/admin/orchestration/workflows/[id]/cost-estimate/route.ts` — HTTP endpoint
- `tests/unit/lib/orchestration/cost-estimation/workflow-cost.test.ts` — unit tests (heuristic, empirical, shape detection, input parsing)
- `tests/integration/api/v1/admin/orchestration/workflows.id.cost-estimate.test.ts` — endpoint integration tests

## Calibration notes

The heuristic constants were initially calibrated against the provider-model-audit workflow (13 LLM-producing steps, supervisor, scales with selected model count). When the empirical floor is reached for a given workflow + supervisor combination, the ratio adapts to whatever that workflow actually consumes. If a workflow consistently runs at 2x the heuristic prediction, the calibration ratio will reflect that.

Past runs are capped at 100 most recent (descending by `completedAt`) — older runs would drag the estimate toward stale prompt shapes anyway.
