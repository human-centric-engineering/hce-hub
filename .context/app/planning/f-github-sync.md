---
name: f-github-sync
feature: 14 / f-github-sync
status: in flight        # not started | in flight | blocked | shipped
owner: Simon
opened: 2026-08-03
plan: .context/app/planning/plan.md
spec: .context/app/planning/v1-requirements.md
---

# f-github-sync — GitHub PR integration + PR-merged reconcile

*Feature 14 on [plan](./plan.md). The last **V1** feature (with [f-authoring-fidelity](./f-authoring-fidelity.md) §21): it makes the live Hub useful without any AI — a task's status auto-tracks its pull request. Depends on [f-hub-capabilities](./f-hub-capabilities.md) §07 (the capability + MCP seam) and the [f-status-model](./f-status-model.md) §20 task model it drives. Pulled into V1 by the owner (2026-08-03); everything after it (§12 f-sidekick, §13 f-intake, §15 f-morning-brief) is V2/AI.*

## Intent

Close the loop between **task state in the Hub** and **PR state on GitHub**, so the record keeps itself honest once the studio is working live:

- **A human links a task to its PR** (`set_pr`) — the "PR-URL declared by human in v1" the plan always named, promoted to the first, standalone task. No status change: linking a PR is not the same as merging it, and the 3-state model (`claimed | active | merged`) has no in-PR state.
- **A merged PR flips its task to `merged`, automatically** — an inbound GitHub webhook (HMAC-verified) drives the *same* shared complete-task core the sheet button and MCP `complete_task` verb use, then surfaces the dependents that are now unblocked ("you're up next").
- **Reconcile is safe under real webhook conditions** — idempotent on re-delivery, no-ops on unknown-PR / already-merged, replay-protected.

**No AI in V1.** The original §14 plan routed this through the orchestration layer (a per-agent `call_external_api` capability + reconcile *workflows*). With §14 in a no-AI V1, PR→status sync is a **direct HMAC-verified API route** reusing [f-status-model](./f-status-model.md)'s task-action cores — no agent, no workflow, no LLM. When the AI layer lands (V2), the agent/workflow route can wrap the *same* cores; nothing here blocks it. (Cross-ref: [§5](./design_handoff_hce_hub/v1-requirements.md#5-the-pr-is-the-natural-unit), [§8](./design_handoff_hce_hub/v1-requirements.md#8-v1-scope), [§14 Q8](./design_handoff_hce_hub/v1-requirements.md#14-open-implementation-questions-for-the-sunrise-side-conversation); `.context/orchestration/inbound-triggers.md`, `external-calls.md`.)

## Reconciliation with current repo reality   (required — done first)

Verified against `main` at claim (2026-08-03), recon over `lib/projects/task-actions.ts`, `lib/projects/capabilities/{start-task,complete-task}.ts`, `lib/app/capabilities.ts`, `prisma/seeds/app/{014,015}-*.ts`, `prisma/schema/app.prisma` (the `ProjectEventKind` enum + `Task.prUrl`), `components/hub/projects/log/{presentation,types}.ts`, `lib/projects/transfer/schema.ts`, and `.context/orchestration/inbound-triggers.md`. Each finding is a decision.

- **`Task.prUrl String?` already exists** and is already read by every surface (`plan.ts`, `board.ts`, `task-detail.ts` select it). → **Decision:** `set_pr` only needs to *write* it; no schema change for t-1. It sets/replaces the URL and journals — nothing else touches status.
- **`task_pr_linked` is already in the `ProjectEventKind` enum** (`app.prisma:399`) **and already rendered** — `describeEvent` maps it to "linked a PR" (`log/presentation.ts:43`), `log/types.ts` and `transfer/schema.ts` both list it. The enum comment even anticipates "a `link_pr` … capability (later, f-github-sync)". → **Decision:** **no enum migration, no presentation work** — the event was defined ahead of its emitter (the §17 forward-declaration paying off). `setTaskPr` just emits it; the Log renders it for free.
- **The shared-core pattern is established:** `startTask`/`completeTask` in `task-actions.ts` are funnel-scoped (`resolveTaskAccess` → `NotFoundError`/404, never 403), take an optional `expectedProjectId`, wrap `executeTransaction` + `recordProjectEvent` + `logAdminAction`, and are wrapped by both a thin MCP capability (`start-task.ts`/`complete-task.ts`) **and** the consumer route. → **Decision:** `setTaskPr(userId, taskId, prUrl, expectedProjectId?)` is a third sibling in `task-actions.ts`, identical shape (member-tier, funnel-scoped, idempotent), emitting `task_pr_linked`. The t-3 webhook reconcile drives `completeTask` (the same core) — no second merge path.
- **Capability seam:** `lib/app/capabilities.ts` `initAppCapabilities` registers each via `registerAppCapability(new XCapability())`; each capability has a class (`functionDefinition`) pinned to a seed (`prisma/seeds/app/NNN-*.ts`) by a parity test, plus an `McpExposedTool` upsert. Seeds are numbered — next free is `016`. → **Decision:** `SetPrCapability` (`set_pr`) + `prisma/seeds/app/016-set-pr.ts` + one `registerAppCapability` line; add it to the task-lifecycle parity test (or a sibling).
- **Inbound webhooks (t-2):** Sunrise ships an inbound-trigger surface (`.context/orchestration/inbound-triggers.md`: Slack / Postmark / generic-HMAC adapters, replay protection). For a no-AI V1 the GitHub receiver is a **fork-owned API route** under `app/api/v1/webhooks/github/`, reusing the platform's HMAC-verify + replay primitives where they're exposed, not a new inbound adapter bound to an agent. → **Decision (t-2):** confirm at build whether the generic-HMAC verify helper is reusable directly; a `GITHUB_WEBHOOK_SECRET` env (fork-owned `lib/app/env.ts`). *Recon deferred to t-2's own pass* — t-1 (`set_pr`) is independent and ships first.

**Tier / seam hypotheses (to confirm at build):** pure leaf-app for t-1 (a new core + capability + seed + registration + tests, all fork-owned; no platform edit, no migration, no upstream ask). t-2–t-4 add a fork-owned webhook route + reconcile module + a `GITHUB_WEBHOOK_SECRET` env; whether the platform's HMAC/replay helper is reused-or-reimplemented is a t-2 recon call (watch for an HB2 seam if a helper is `lib/`-private).

## Promoted tasks

**Sizing — ~4 PRs, t-1 first and independent.** `set_pr` (t-1) is a self-contained member verb with no schema change; it closes the last manual-DB PR-link reconcile gap and de-risks the rest. The webhook (t-2), reconcile (t-3), and correctness/smoke (t-4) form the auto-sync spine and land in order.

*(Live Hub task numbers in parentheses — the Hub is the record; these are `chubproject`'s ordinals.)*

| ID  | Task | Files | Deps | Done-when | Status |
|-----|------|-------|------|-----------|--------|
| t-1 (Hub `t-40`) | **`set_pr` — link a PR to a task.** A `setTaskPr(userId, taskId, prUrl, expectedProjectId?)` core in `task-actions.ts` (funnel-scoped, member-tier, idempotent): sets/replaces `Task.prUrl`, emits `task_pr_linked`, audits — **no status change**. A thin `SetPrCapability` (`set_pr`) over it + `016-set-pr.ts` seed (+ `McpExposedTool`) + `initAppCapabilities` registration + parity/unit tests. `task_pr_linked` already renders in the Log. | `lib/projects/task-actions.ts`, `lib/projects/capabilities/set-pr.ts`, `lib/app/capabilities.ts`, `prisma/seeds/app/016-set-pr.ts`, `tests/**` | §07 (shipped), §20 (shipped) | a member can attach/replace a task's PR URL over MCP (`set_pr`) and it persists; the Log shows "linked a PR"; no status change; a non-member/cross-project task → `not_found` (never enumerates); class↔seed parity green; gates green |
| t-2 (Hub `t-41`) | **GitHub `pull_request` webhook ingest (HMAC-verified).** A fork-owned `POST /api/v1/webhooks/github` route: verify the signature against `GITHUB_WEBHOOK_SECRET`, reject absent/bad signatures (401) and replays, parse a merged-PR event to `{ prUrl, merged }`. Direct route — no AI/agent path. | `app/api/v1/webhooks/github/route.ts`, `lib/projects/github/**`, `lib/app/env.ts` | t-1 | a signed `pull_request.closed`+merged payload is accepted and parsed; a bad/absent signature → 401; a replay is rejected; gates green |
| t-3 (Hub `t-42`) | **PR-merged → reconcile task to `merged`.** On a verified merged-PR event, locate the task by its linked `prUrl` → drive the shared `completeTask` core → `merged`; surface downstream dependents now unblocked (notify via hooks/journal). Unknown-PR and already-merged are safe no-ops. | `lib/projects/github/reconcile.ts`, `lib/projects/task-actions.ts` | t-1, t-2 | merging a linked PR flips its task to `merged`; dependents read unblocked; unknown-PR / already-merged no-op; gates green |
| t-4 (Hub `t-43`) | **Reconcile correctness + smoke.** Idempotent on re-delivery (same event twice = one merge); unknown-PR / already-merged no-op; a smoke over a representative GitHub `pull_request` payload. *Watch ([feature-plan-authoring-guide](./feature-plan-authoring-guide.md) §6): dedupe/idempotency is where review pays off.* | `lib/projects/github/**`, `tests/**` | t-3 | re-delivery is idempotent; the smoke passes over a real payload; gates green |

*Standing steps in each Done-when:* vitest strategy below; `commit → /pre-pr → /security-review → push → open PR → /code-review`; `gh pr create --repo human-centric-engineering/hce-hub`. t-1 has **no migration**; t-2 adds an env only. **No HB2 anticipated** (confirm the HMAC-helper reuse at t-2).

## Test strategy

vitest = happy-dom, no live DB ([planning-retro](./planning-retro.md) B9): mock `@/lib/db/client` / `tx`.

- **`setTaskPr` (t-1):** sets `prUrl` on a claimed/active/merged task (no status change); replaces an existing URL; emits exactly one `task_pr_linked`; a non-member / cross-project id → `NotFoundError`; the `SetPrCapability` maps that to `not_found` and never enumerates; class↔seed **parity** green.
- **Webhook (t-2):** a valid signature passes, a tampered/absent one → 401; a replayed delivery id → rejected; a non-merge `pull_request` action → ignored.
- **Reconcile (t-3/t-4):** a linked merged PR → task `merged` + dependents surfaced; unknown-PR → no-op; a second delivery of the same event → still one merge (idempotent); the smoke payload round-trips.

## Open questions

- **Resolved inline:** no `Task.prUrl` migration (exists); no `task_pr_linked` enum/presentation work (defined + rendered ahead of the emitter); `setTaskPr` as a third `task-actions.ts` sibling; the webhook as a fork-owned direct route (no agent) for a no-AI V1; reconcile drives the shared `completeTask` core.
- **For the owner (already steered):** V1-no-AI reshape of §14 confirmed (owner, 2026-08-03) — direct HMAC webhook, not an agent workflow; `set_pr` promoted to t-1. Recorded in the Hub journal (`record_decision`, `eventId cmsdg06ll0013fssbdyk3n8kx`).
- **For t-2 recon:** is the platform generic-HMAC verify/replay helper reusable directly, or does the fork reimplement a small verify? (HB2 watch.) PR-URL auto-detection stays deferred (§8) — humans link via `set_pr` in V1.

## Upstream follow-ups / seam ledger

**None anticipated for t-1** (pure leaf-app). t-2 may surface one if the platform's HMAC/replay primitive isn't exposed for fork reuse — decide fix-on-fork vs raise-issue at build (HB6/HB7).

## Decisions log   (append-only, newest first)

- **2026-08-03 — Claimed + planned (owner Simon); §14 reshaped for a no-AI V1.** Pulled into **V1** (with §21) so the live Hub auto-tracks PR state without any AI. The original plan routed PR sync through the orchestration layer (`call_external_api` capability + reconcile workflows); with no AI in V1 that's replaced by a **direct HMAC-verified webhook route** reusing [f-status-model](./f-status-model.md)'s task-action cores (core-reuse, like `start_task`/`complete_task`). Four tasks: **t-1 `set_pr`** (human links a PR; the "declared by human in v1" groundwork, promoted to first + standalone — no status change), t-2 webhook ingest (HMAC), t-3 PR-merged reconcile (drives the shared `completeTask` core), t-4 correctness + smoke. Recon confirmed the two enablers are already in place: `Task.prUrl` exists (no migration for t-1) and `task_pr_linked` is enum- **and** render-ready (defined ahead of its emitter in §17). When the AI layer lands (V2), the agent/workflow route can wrap the same cores — nothing here blocks it. Claimed + planned over MCP (`claim_feature` → `plan_feature`, tasks born `t-40…t-43` claimed); decision journalled (`eventId cmsdg06ll0013fssbdyk3n8kx`). **Docs authored in parallel (MD detail + Hub state) — the [f-authoring-fidelity](./f-authoring-fidelity.md) §21 lossy-write-path caveat still holds until §21 ships.**
