# GitHub identity (f-github-identity §23)

Maps a Hub user to their **GitHub identity** so GitHub activity can be attributed
to the right person — and gives members a self-service way to connect/disconnect
that identity. This is HCE Hub-owned (fork tier); it builds on the inbound-only
[GitHub PR sync](./github-sync.md) (§14).

## Why

`f-github-sync` reconciles a merged PR onto the board but deliberately deferred
one thing: mapping the PR's **`merged_by`** actor to a Hub user needed a
GitHub-identity ↔ Hub-user table, "not something to fake by attributing to a
system account." This feature is that table, plus the flow that fills it and the
attribution that consumes it.

## Data model

**`app_user_github`** (`prisma/schema/app.prisma`, model `UserGithubIdentity`) —
a fork-owned **satellite** of the core `user` table via a plain-`String`
hand-FK (`ON DELETE CASCADE` — the link is the user's personal data; see
[CUSTOMIZATION §5](../../CUSTOMIZATION.md)). Fields:

- `userId` — one identity per Hub user (`@unique`).
- `githubUserId` — GitHub's **immutable numeric id**, the **sole identity key**
  (`@unique`).
- `githubLogin` — the current username. **Not unique**: a login is mutable and
  recyclable (someone renames, another claims the freed name), so it must never
  be an identity key or block a legitimate new link.
- `avatarUrl`, `connectedAt`.

**`app_task.mergedByUserId`** — a hand-FK (`ON DELETE SET NULL`) recording the
PR's merger mapped to a Hub user. **Additive**: it never overwrites
`claimedByUserId` (the doer).

Both hand-FKs are pinned by drift probes in `lib/app/db-drift.ts`.

## The identity service

`lib/projects/github/identity.ts`:

- `getGithubIdentity(userId)` / `upsertGithubIdentity(userId, {...})` (idempotent
  by `userId`; a re-link refreshes login/avatar) / `disconnectGithubIdentity(userId)`.
- `resolveHubUserByGithubId(githubUserId)` — **id only, by design**. A login is
  mutable/recyclable, so matching on it would resolve a stale username to the
  wrong Hub user (a silent misattribution). Every source the Hub attributes from
  (the `merged_by` webhook, the GitHub API) carries the numeric id, so id-only
  loses nothing.
- A unique-constraint hit (the GitHub account is already linked to a **different**
  Hub user) surfaces as a domain `ConflictError`.

## Linking flow — OAuth to _link_, not to _sign in_

A small, fork-owned OAuth client (`lib/projects/github/oauth.ts`) —
**deliberately not** a better-auth social sign-in provider (that would open a
signup path in an invite-only app and force a core `lib/auth/config.ts` edit).

Routes under `app/api/v1/users/me/github/`:

| Route                | What                                                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /connect`       | Mint a 256-bit CSRF `state`, set it in an HttpOnly + `SameSite=Lax` short-TTL cookie, redirect to GitHub (no `scope` — least privilege).                                                                                         |
| `GET /callback`      | Verify the `state` against the cookie (mismatch/absent → `?github=error`, before any exchange), exchange the code, read `/user`, persist `{id, login, avatar}`, **discard the token**, redirect to `/settings?github=connected`. |
| `GET /` · `DELETE /` | Current link state (`connected` / `githubLogin` / `configured`) · unlink.                                                                                                                                                        |

The access token is used **once** to read the id/login and then discarded — the
Hub never calls GitHub again for the user (attribution arrives via the inbound
webhook), so nothing credential-bearing is stored.

**Config (prod-only activation):** `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET`
(`lib/app/env.ts`, both optional). Unset → the routes return 503 and the feature
is dormant, like `GITHUB_WEBHOOK_SECRET`. The GitHub OAuth app's Authorization
callback URL must be `${BETTER_AUTH_URL}/api/v1/users/me/github/callback`.

## The account-section seam (UI)

The connect/disconnect surface lives on the existing `/profile` + `/settings`
(Sunrise-owned) pages via a narrow, fork-first **section-contributor seam**:

- `lib/account-sections/registry.ts` (registry) + `components/account/account-sections.tsx`
  (renderer) — a one-line `<AccountSections/>` slot on each page; empty in vanilla
  Sunrise. Logged as [platform-divergences](./platform-divergences.md) row 22; the
  narrow upstream ask is filed as the feature close-out.
- The fork registers `components/hub/account/github-connection.tsx` from
  `lib/app/account-sections.ts`.

## Merge attribution

`lib/projects/github/reconcile.ts`: on a merged-PR close, the `merged_by` actor is
resolved **once** (id-first) via `resolveHubUserByGithubId` and threaded into
`completeTask` as an additive `mergedBy`, which sets `Task.mergedByUserId` and
enriches the `task_merged` journal event (`mergedByUserId` + the raw
`mergedByGithubLogin`). The doer (`claimedByUserId`, the event's `actorUserId`) is
never overwritten. An unlinked/external merger resolves to `null` — the raw login
is still kept in the journal. The task sheet shows a "Merged by &lt;member&gt;"
line when the merger is a linked Hub user.

**The one case where the merger also becomes the doer** (`f-work-kinds` §32 t-89,
owner call): a task with **no** claimant at all. That became reachable when
enhancements started being born unassigned and any task could be released — before
that, the create cascade guaranteed a holder. `adoptsMergerAsDoer` fills
`claimedByUserId` in, and the `task_merged` event records `doerAdopted: true` so
inferred credit stays distinguishable from earned. This does not weaken "never the
doer": that rule exists so a webhook cannot overwrite whoever did the work, and here
there is nobody to overwrite. A real name beats a blank on merged work; it is an
edge case, and if unclaimed merges turn out to be common the mechanism can change
then. An **unmapped** merger still adopts nobody — there is no Hub user to credit,
so the task is skipped and stays visibly open.

## GDPR

`app_user_github` is `exported` in `HUB_SUBJECT_TABLES` and cascade-deleted on
erasure. `Task.mergedByUserId` nulls on erasure (retained work) and is included in
the subject's exported tasks. Both are proved by `scripts/app/smoke/erasure.ts`.
