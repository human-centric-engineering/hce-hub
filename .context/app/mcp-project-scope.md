# MCP as a project-scoped interface

The Hub's MCP surface is a member's programmatic interface, bound to a project
the way the UI is bound for a human. A member mints a **project-scoped MCP key**
from a project ("connect a repo"), pastes it into a repo's `.mcp.json`, and the
Claude Code session in that repo is then bound to exactly one Hub project:
`projectId` becomes **ambient**, so the agent never passes it and cannot reach a
different project through that key.

This is feature `f-mcp-project-scope` (§31). This doc covers the connection model
and the **ambient-scope mechanism** (t-A). The member-facing key minting UI
(create / rotate / revoke) lands in later tasks (t-C, t-D).

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
- **cross-project guard** — an explicit `projectId` that differs from the key's
  scope is rejected (`isError`, no dispatch), so a scoped key can never act on
  another project by naming it.

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

### Boundary (by design)

The scope binding fixes the **project dimension** for verbs that take one; it is
an ergonomics + accident-prevention layer, **not** a privilege boundary. The
privilege boundary is membership, and a scoped key can never exceed what its
owner could already do with their unscoped key. A verb keyed purely on an entity
id (e.g. `start_task taskId`) is bounded by the membership funnel, not by the
key's project — so a multi-project member's scoped key could act on one of their
_other_ projects' tasks by raw id. That is the same access they already hold; if
hard per-key entity isolation is ever wanted, it's a follow-up that compares each
resolved entity's `projectId` to the key scope.

## Related

- [github-sync.md](./github-sync.md) — the `merged_by` → Hub-user mapping that a
  later identity feature needs; a sibling consumer of the same access funnel.
- [task-reads.md](./task-reads.md) — the read chain (`list_tasks` → `get_task`)
  that t-B completes with `get_feature` / `list_projects` / `get_project` /
  `list_events`.
