# GitHub PR sync

[f-github-sync](./planning/f-github-sync.md) closes the loop between a task and its pull request. `set_pr`
([f-status-model](./planning/f-status-model.md)) lets a task carry its PR URL; this feature reconciles the
**merge** back onto the board: when a linked PR merges, every task that carries
that PR URL moves to `merged` automatically, credited to the Hub worker who did
the work.

> A developer opens a PR, links it to their task (`set_pr`), and forgets about
> the board. The PR merges → the task is `merged`, its feature's progress ticks,
> and any task that was blocked on it unblocks — with no one touching the Hub.

One-way, GitHub → Hub. There is **no Hub UI** to configure and nothing is pushed
back to GitHub; reconciliation is purely "a merged PR's URL matched a task's
`prUrl`".

## Quick start — activation (operator, prod-only)

GitHub can't reach `.test`/localhost, so this only runs on a public deployment
(`hub.hce.studio`). Two steps, both operator-side:

1. **Set the secret.** Generate one (`openssl rand -hex 32`) and set
   `GITHUB_WEBHOOK_SECRET` in the deployment env, then redeploy. Until it's set
   the route returns **503** and no reconciliation happens — the feature is
   dormant, so merging the code is harmless before you configure it.
2. **Add the webhook** on each repo (Settings → Webhooks → Add webhook):
   - **Payload URL** `https://hub.hce.studio/api/v1/webhooks/github`
   - **Content type** `application/json`
   - **Secret** the same value as `GITHUB_WEBHOOK_SECRET`
   - **Events** "Let me select individual events" → **Pull requests** only
   - **Active** ✓

The webhook's own delivery log (GitHub → the webhook → Recent Deliveries) is the
first place to look when a merge doesn't reconcile: a green 200 means the Hub
accepted and processed it.

## Why standalone, not an inbound adapter

Sunrise already has an inbound-webhook pipeline
([inbound-triggers](../orchestration/inbound-triggers.md), `/api/v1/inbound/:channel/:slug`) — but it is
**workflow-bound**: every verified inbound creates an `AiWorkflowExecution` and
drains the engine. GitHub sync doesn't run a workflow; it makes a small,
deterministic board write. Forcing it through the inbound pipeline would mean
authoring a workflow whose only job is to call one core function, plus carrying
the trigger/scope machinery for no gain.

So this is a **standalone route** that reuses only the _idea_ of HMAC
verification — not Sunrise's `verifyHookSignature`, because the two signing
schemes differ (see below). Everything else (task lookup, status transition,
audit, events) reuses the same [f-status-model](./planning/f-status-model.md) cores the MCP verbs and the
task sheet already drive.

## Module layout

```
lib/projects/github/
├── verify-signature.ts   # verifyGithubSignature — X-Hub-Signature-256, constant-time
└── reconcile.ts          # reconcilePullRequestEvent — merged PR → completeTask per task

app/api/v1/webhooks/github/route.ts   # the HTTP entry point
lib/app/env.ts                        # GITHUB_WEBHOOK_SECRET (fork-owned env seam)
```

Reconciliation drives `completeTask` from `lib/projects/task-actions.ts` — the
same core the `complete_task` MCP verb and the task sheet's "Complete" action
use. No new transition logic; the webhook is just a third caller.

## Request flow

```
POST /api/v1/webhooks/github
  ↓ section rate limit (webhooks → api tier, IP-keyed for GitHub)   # applied by proxy.ts
  ↓ secret = env.GITHUB_WEBHOOK_SECRET            → 503 if unset (feature dormant)
  ↓ rawBody = await request.text()                → 400 if unreadable (GitHub signs the RAW body)
  ↓ verifyGithubSignature(rawBody, secret, X-Hub-Signature-256)  → 401 if invalid (uniform, no reason surfaced)
  ↓ event = X-GitHub-Event header                 → 200 {handled:false} for ping / non-pull_request
  ↓ payload = JSON.parse(rawBody)                 → 400 if not JSON
  ↓ reconcilePullRequestEvent(payload)            # Zod-validated inside; never throws on shape
  ↓ 200 { handled, prUrl, matched, reconciled, skipped }
```

Every non-2xx that GitHub sees, it retries. The route answers **200 for no-op
events** (ping, `opened`, `synchronize`, an unmerged close) precisely so GitHub
marks those deliveries healthy and doesn't retry them — a no-op is a success, not
a failure.

## Signature verification

GitHub signs each delivery as `HMAC-SHA256(secret, rawBody)` and sends the digest
as `X-Hub-Signature-256: sha256=<hex>`. `verifyGithubSignature` recomputes it over
the raw body and compares with `crypto.timingSafeEqual`. A malformed,
wrong-length, or absent header is `false` — never a throw — so the route can
answer a uniform 401 without leaking which check failed.

This is **not** Sunrise's `verifyHookSignature`
(`lib/orchestration/hooks/signing.ts`), which signs `${timestamp}.${body}` with
an `X-Sunrise-Timestamp` / `X-Sunrise-Signature` pair and rejects stale
timestamps. GitHub's scheme has no timestamp component, so that verifier is not
reusable; hence the fork-owned one. GitHub's scheme has no replay window, but it
doesn't need one here: reconciliation is **idempotent** (a re-played merge event
re-completes an already-`merged` task to no effect — see below), so the missing
timestamp check is not a gap.

## Reconciliation behaviour

`reconcilePullRequestEvent` acts **only** on a merged close
(`action === 'closed' && pull_request.merged === true`). Everything else returns
`{ handled: false }` without a DB read.

On a merged PR it finds **all** tasks whose `prUrl` equals the PR's `html_url`
and drives each to `merged`:

- **One PR, many tasks.** A single PR can deliver several tasks (this feature's
  own PR merged three). `findMany` matches them all; each is completed
  independently.
- **Actor = the task's own `claimedByUserId`.** The worker who did the work is
  credited as the one who completed it — **never the webhook**. This is a
  deliberate [f-github-sync](./planning/f-github-sync.md) decision: mapping GitHub's `merged_by` to a Hub
  user is a proper later feature (it needs a GitHub-identity ↔ Hub-user table),
  not something to fake by attributing to a system account.
- **Idempotent.** `completeTask` is a no-op on an already-`merged` task, so a
  re-delivered event (GitHub retries, or a manual redelivery) changes nothing.
- **Resilient skips.** A matched task whose claimant is no longer a project member
  (the [f-access](./planning/f-access.md) funnel's 404) is **skipped with a
  warning** rather than failing the whole delivery — one bad task never blocks
  the others. An **unclaimed** task completes as the merger, who is adopted as its
  doer (§32 t-89 — see
  [github identity](./github-identity.md#merge-attribution)); it is skipped only
  when the merger is unmapped, leaving nobody to credit.
- **Unblocking is free.** Task/feature status is derived, so a merged task's
  dependents recompute as unblocked on the next board read — no cascade write.

The 200 body (`{ matched, reconciled, skipped }`) is a summary for the logs and
the GitHub delivery inspector; nothing consumes it programmatically.

## Environment variables

| Variable                | Required to enable             | Notes                                                                                                                                                      |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | Yes (or the route returns 503) | Shared secret; set the SAME value here and as each repo webhook's "Secret". Declared in the fork-owned `lib/app/env.ts` as `z.string().min(1).optional()`. |

Optional-by-design: an unset secret leaves the feature dormant (503, no-op)
rather than failing boot, so a deployment opts in only when it's ready.

## Anti-patterns

- **Don't attribute the completion to the webhook or a system account.** The
  actor is the task's `claimedByUserId`. A merge event is provenance for _who
  merged_, but the Hub is recording _who did the work_, and that's the claimant.
  If a future version wants "merged by", add the GitHub-identity mapping — don't
  repurpose the actor field.
- **Don't route this through the inbound pipeline.** See
  [Why standalone](#why-standalone-not-an-inbound-adapter). The inbound registry
  exists to fire workflows; a board reconcile is not a workflow.
- **Don't parse the body before verifying it.** The signature covers the raw
  bytes; read `request.text()`, verify, _then_ `JSON.parse`. Verifying a
  re-serialised body would not match GitHub's digest.
- **Don't surface the verification failure reason.** The route returns a uniform
  401 with the standard envelope; telling a caller _which_ check failed helps an
  attacker probe.
- **Don't let one task fail the delivery.** Per-task errors that are the funnel's
  404 are caught and skipped; a genuinely unexpected error propagates (and GitHub
  retries), but routine "this task can't be resolved" is a skip, not a 500.

## Testing

- `tests/unit/lib/projects/github/verify-signature.test.ts` — valid / wrong-secret
  / tampered-body / malformed-header / missing / UTF-8 body.
- `tests/unit/lib/projects/github/reconcile.test.ts` — no-op cases (non-pull_request
  shape, non-closed, unmerged), single + multi-task reconcile, unclaimed skip,
  ex-member (`NotFoundError`) skip, non-`NotFound` error propagation.
- `tests/unit/app/api/v1/webhooks/github/route.test.ts` — 503 (no secret), 401
  (bad sig), 400 (non-JSON + unreadable body), 200 ping no-op, 200 reconcile.
- `tests/integration/api/v1/webhooks/github/route.test.ts` — the "smoke": a
  **genuine** `X-Hub-Signature-256` (real verifier, real reconciler; only the DB
  and env mocked) drives route → verify → reconcile end-to-end, including a
  wrong-secret and a tampered-body 401.

Following the project convention, the integration test mocks `@/lib/db/client`
rather than running a testcontainer. Real end-to-end proof is a live PR merge in
a configured repo — GitHub can't reach `.test`/localhost.

## Related docs

- [f-status-model](./planning/f-status-model.md) — the `claimed | active | merged` model and the
  `completeTask` core this drives; `set_pr` (which populates `Task.prUrl`).
- [f-access](./planning/f-access.md) — the membership funnel whose 404 is the "claimant not resolvable"
  skip.
- [inbound-triggers](../orchestration/inbound-triggers.md) — the workflow-bound pipeline this deliberately does _not_
  use, and why.
- [Rate limiting](../security/rate-limiting.md) — the `/api/v1/webhooks/` section
  policy this route inherits.
