# MCP as a project-scoped interface

The Hub's MCP surface is a member's programmatic interface, bound to a project
the way the UI is bound for a human. A member mints a **project-scoped MCP key**
from a project ("connect a repo"), pastes it into a repo's `.mcp.json`, and the
Claude Code session in that repo is then bound to exactly one Hub project:
`projectId` becomes **ambient**, so the agent never passes it and **cannot reach
another project through that key** — on every verb, whether it takes a
`projectId` or acts on an entity by id (see [Enforcement](#enforcement) below).

This is feature `f-mcp-project-scope` (§31). This doc covers the connection model,
the **ambient-scope mechanism** (t-A), and **member self-service key minting**
(t-C). The in-app "Connect a repo" UI is t-D.

## The connection model

```
Hub UI (a project you're a member of)
  └─ "Connect a repo" → mints McpApiKey { createdBy: you, scope: { projectId } }
       └─ paste into the repo's .mcp.json
Claude Code session in that repo
  └─ every Hub verb folds scope.projectId into its args
       → projectId is ambient; the agent omits it,
         and a scoped key cannot target another project
```

Two properties, both keyed to the key's **owner** (`createdBy`):

- **Identity.** MCP auth resolves a key to `auth.createdBy`, and the dispatch
  path sets `context.userId = auth.createdBy`
  (`lib/orchestration/mcp/protocol-handler.ts`). A key acts **as its creator** —
  so a key is a personal secret, never shared (sharing one = handing over your
  identity and membership).
- **Membership** is enforced on two independent layers:
  1. **At mint time** — a member may only mint a scoped key for a project they
     belong to (t-C).
  2. **At every call** — the existing access funnel
     (`getAccessibleProject(userId, projectId)`) re-checks membership on each
     verb, so a revoked membership instantly removes the key's reach. There is no
     stale grant to clean up.

The **unscoped key** (no `scope`) stays: it acts as its owner and reaches any
project they're a member of — for the rare cross-project terminal session.
`list_projects` / `get_project` are its entry point (t-B).

## Ambient scope (t-A)

The mechanism lives in one place — the MCP `tools/call` dispatch
(`lib/orchestration/mcp/tool-registry.ts` → `callMcpTool`) — not in the 24 verbs.
Before dispatching, `foldProjectScope` (`lib/orchestration/mcp/tool-scope.ts`)
folds the key's `scope.projectId` into the tool args:

- **fill-if-absent** — a scoped key that omits `projectId` gets the key's project
  supplied. (An empty string counts as absent.)
- **cross-project guard** — an explicit `projectId` that is not exactly the
  key's scope (a different string, or any non-string) is rejected (`isError`, no
  dispatch), so a scoped key can never act on another project by naming it and
  the guard does not depend on each verb's own validation.

**Contract:** the stored `scope.projectId` MUST be the project's **cuid**
(`Project.id`), not its slug — every verb resolves it through
`getAccessibleProject`'s `findUnique({ where: { id } })`, which is cuid-only
(only the URL seam `getAccessibleProjectByRef` accepts a slug). If the mint (t-C)
stored a slug, every scoped call would 404 silently. So t-C stores the resolved
id.

Both rules apply **only when the target tool declares a `projectId` argument**
(`toolAcceptsProjectId` checks the tool's input schema). This gate matters:

- Verbs keyed on an entity id (`taskId` / `featureId`) don't declare `projectId`,
  so there is nothing to fold.
- Some built-in capabilities use a `.strict()` Zod schema that would _reject_ an
  unexpected `projectId` key. Gating on the declared property leaves them
  untouched.
- For the verbs that take an **optional** `projectId` guard (`get_task`,
  `list_tasks`), folding the scope in _tightens_ them for free — the read is
  pinned to the key's project.

Unscoped keys (no `scope.projectId`) are passed through unchanged: `projectId`
stays a required argument, exactly as before. This is **MCP-dispatch-only** — the
web and workflow paths dispatch capabilities directly and never pass through the
fold, so they are unaffected.

## Enforcement

A scoped key is a **hard project boundary** — every verb is isolated, by one of
two mechanisms:

- **`projectId`-keyed verbs** (`list_phases`, `list_tasks`, `create_feature`, …)
  are pinned by the **fold** above: the scope fills `projectId`, and a
  contradicting explicit `projectId` is rejected.
- **entity-id verbs** (`start_task`, `claim_feature`, `update_idea`,
  `create_task`, `add_note`, …) are pinned at the **shared access funnel**. Each
  passes `context.scope?.projectId` as the `expectedProjectId` guard that
  `resolveTaskAccess`-scoped services (`resolveScoped`), `resolveFeatureAccess`,
  `resolveEventScope`, `claimFeature`, and `updateIdea` already honour: after the
  entity resolves to its project, a mismatch with the key scope is `not_found`
  (before the membership check — indistinguishable from a missing entity, no
  enumeration). So a scoped key handed a `taskId`/`featureId`/`ideaId` from
  another project gets `not_found`, exactly as if it named the foreign project.

Underneath the ergonomics, this stays layered on **membership**: the funnel still
resolves access for the key's owner, so a scoped key never exceeds what its owner
could do — the scope narrows that to a single project. A leaked scoped key is
therefore worth **one** project, not all of the owner's.

Note the scope must be the project **cuid** (see the contract above); the guard
compares ids, so a slug in scope would `not_found` every call.

## Minting keys — member self-service (t-C)

Key management is lifted out of `/admin`: any **member** of a project mints,
rotates, and revokes their own project-scoped key through a fork-owned,
member-facing surface (`lib/projects/mcp-keys.ts` + the routes under
`app/api/v1/projects/[projectId]/mcp-keys/`). The admin key routes stay for the
unscoped "super-admin" key; this is the narrow, member-safe path.

```
GET    /api/v1/projects/:projectId/mcp-keys           — your keys for the project
POST   /api/v1/projects/:projectId/mcp-keys           — mint (plaintext returned once)
POST   /api/v1/projects/:projectId/mcp-keys/:keyId/rotate  — fresh secret, old invalidated
DELETE /api/v1/projects/:projectId/mcp-keys/:keyId    — revoke (delete)
```

The safety of a self-service surface is in what a member **cannot** choose:

- **Scope is forced** — `scope = { projectId }`, and the `:projectId` (slug or
  cuid) is resolved through the membership funnel so the stored value is the
  **canonical cuid** (the contract above), never a slug.
- **Scopes are locked** — `tools:list` + `tools:execute` only
  (`PROJECT_KEY_SCOPES`). A member cannot mint a `resources:read` / system /
  unscoped key, so a leaked member key drives the coordination verbs for one
  project and nothing more.
- **Ownership is enforced** — every op resolves a key the caller **created and
  that is scoped to this project**; another member's key, an admin key, or a key
  in another project is `not_found` (uniform, anti-enumeration).
- **Bounded** — a per-member, per-project active-key cap
  (`MAX_ACTIVE_KEYS_PER_PROJECT`) keeps a self-service surface from accumulating.

`withAuth` gates the routes (not `withAdminAuth`); the `/api/v1/**` section rate
limit (proxy.ts) bounds creation velocity. Create/rotate/revoke are audit-logged.

## Related

- [github-sync.md](./github-sync.md) — the `merged_by` → Hub-user mapping that a
  later identity feature needs; a sibling consumer of the same access funnel.
- [task-reads.md](./task-reads.md) — the read chain (`list_tasks` → `get_task`)
  that t-B completes with `get_feature` / `list_projects` / `get_project` /
  `list_events`.
