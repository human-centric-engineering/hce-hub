# Live project surfaces

[Phase 2](./planning/phase-2-plan.md)'s §36. Every project surface updates on its
own within a few seconds of a change made **anywhere** — over MCP, by the GitHub
webhook, or by another member — with no reload. This documents what shipped; the
transport and revision-source decisions are in the project journal.

> The Hub's working loop is _agent writes over MCP → human reads the board_. Before
> this, the two halves were looking at different states by construction: friction
> with one person, a correctness problem with two.

## The shape, in one line

One poller per page asks `GET /api/v1/projects/:id/revision` every 5s. When the
token moves, server-rendered surfaces come back via `router.refresh()` and
client-fetched ones re-run their own effect.

## The two halves, and why the second is not optional

**Server-rendered** — Plan, Board, Ideas, the active-bugs strip, the feature page,
the project header. `router.refresh()` re-runs the server render **without
remounting**, so expanded phase bands, scroll position and every other piece of
local state survive. This is the same call the write paths have always made after a
local edit; the only new thing is a reason to make it when the edit was somebody
else's.

**Client-fetched** — the Log tab, the task sheet, the task-sheet activity timeline,
the feature activity timeline. `router.refresh()` does **not** re-run a `useEffect`,
so these do not come back that way. Left alone they would sit visibly stale over a
Plan that updated correctly — the exact problem this feature exists to remove,
reintroduced one layer down. Each takes `useProjectLive()` as an effect dependency.

That asymmetry is the single most important thing to know before touching this: **a
new surface is not live because the page is.** If it fetches its own data, it has to
opt in.

## The revision cursor

`GET /api/v1/projects/:id/revision` returns an opaque token that changes iff
something in the project changed, plus a diagnostic `changedAt`. `If-None-Match`
gets a 304 while nothing has moved.

The token is `(MAX(mutation timestamp), COUNT(*))` folded across twelve tables:

| change                       | max                          | count |
| ---------------------------- | ---------------------------- | ----- |
| insert                       | rises                        | rises |
| update                       | rises                        | —     |
| delete                       | —                            | falls |
| delete + insert in one write | rises (the new row is newer) | —     |

Neither half is sufficient alone, and the case that needs both is a **dependency
swap**: `update_feature` skips `tx.feature.update()` entirely when nothing but
`dependsOn` changed, so replacing one edge with another moves no parent timestamp
and leaves the count identical. Only the edge table's own `createdAt` sees it.

**Why not the journal.** `ProjectEvent` looks like the obvious cursor and is
incomplete: `update_feature`, `update_task`, `capture_idea` and `update_idea` write
no event at all, and `reorderPhases` deliberately writes none. It would also need
hand-maintaining forever. `@updatedAt` is set by Prisma on every update, so a new
verb cannot forget to move the cursor — it never had to remember. (The journal gap
is real but separate: idea #30.)

## Adding a table

`PROJECT_REVISION_TABLES` in [`lib/projects/revision.ts`](../../lib/projects/revision.ts)
rules on every `app_*` table. A table counts iff its **foreign keys lead back to a
`Project`** — structural, not "does a surface render it today", which is a judgement
that rots the moment a surface is added.

You do not have to remember this: `tests/unit/lib/projects/revision.test.ts` walks
the schema's foreign keys and fails on a table nobody has ruled on, in **both**
directions. Mark a new model `counted` and it must have a query fragment; mark it
`not-project-scoped` when its FKs say otherwise and the build fails by name.

## Adding a surface

- **Server-rendered?** Nothing to do. It is already live.
- **Fetches its own data?** Call `useProjectLive()` and add it to the effect's
  dependency array. Add a row to `CLIENT_FETCHED_SURFACES` in
  `tests/unit/components/hub/projects/project-live.test.tsx` — the table drives both
  the "re-reads on change" and the "does NOT re-read otherwise" assertions, so a new
  surface is covered by adding one row rather than a fifth copy of the same test.

## Rate limiting

The endpoint has its **own** `hub-revision` tier (480/min, session-user), registered
from [`lib/app/rate-limit.ts`](../../lib/app/rate-limit.ts). On the shared `api`
tier it would spend the single 100/min budget every other `/api/v1` call of the same
user draws on, so a few open tabs would make ordinary writes start returning 429 —
the app rate-limiting itself out of working.

The cap is derived, not picked: 20 tabs × the 5s cadence × 2 for off-cadence polls
(`useAutoRefresh` fires on mount and on every `visibilitychange`). **Change the
cadence and this number moves with it** — a test pins the derivation.

The client backs off exponentially on any failure, capped at 32 skipped ticks. That
matters because **a 429 here is silent**: a poller has no user-visible failure mode,
so without a backoff a rate-limited tab would hammer a closed door for as long as it
stayed open, with nothing on screen to say why.

## Deliberate limits

- **Invalidation is coarse.** One project-wide token refreshes whatever is open,
  rather than invalidating precisely. `router.refresh()` preserves state, payloads
  are small, and per-feature/per-task revisions would multiply both the endpoint and
  the wiring for near-zero gain at this team size.
- **Core `user` edits are invisible.** Names and avatars render from Sunrise's
  `user` table, which the manifest does not cover, so a member who renames
  themselves shows stale until the next project change. Erasure is mostly covered by
  the membership cascade.
- **The clock is the application's, not the database's.** Prisma sets `@updatedAt`
  in the Node process, so under multi-instance clock skew a lagging instance's
  _update_ can fail to raise `MAX`. Inserts and deletes still move the count.
- **One growth term.** `app_project_event`'s `COUNT(*)` is O(events in project) on
  the most frequently hit endpoint in the app. Sub-millisecond today; the only term
  that does not stay flat.

## Why polling and not SSE

`lib/api/sse.ts` exists and Sunrise's chat streams over it, but that precedent is a
single request/response stream, not a fan-out bus. The Hub deploys to **Vercel
serverless**, so an MCP write and an SSE reader land in different invocations with
no in-process emitter between them. Making SSE work would need external pub/sub (no
Redis is configured — new infrastructure, new secrets) or a stream that polls the
database internally, which is polling with a long-held billed function attached.

Polling needs nothing new, behaves identically on Vercel and self-hosted Docker, and
fails safe: a dropped poll is a no-op that retries on the next tick.

## Reference

| Thing                   | Where                                        |
| ----------------------- | -------------------------------------------- |
| Revision service        | `lib/projects/revision.ts`                   |
| Endpoint                | `app/api/v1/projects/[id]/revision/route.ts` |
| Poller + context        | `components/hub/projects/project-live.tsx`   |
| Rate-limit registration | `lib/app/rate-limit.ts`                      |
| Real-DB proof           | `npm run smoke:project-revision`             |
