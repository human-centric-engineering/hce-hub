# Hub tools in Claude Code (MCP)

HCE Hub's coordination tools — starting with **`next_task`** ([[f-hub-capabilities]]) — are
registered Sunrise **capabilities**. They run in the same dispatcher the chat sidekick uses,
and are exposed over Sunrise's **MCP server** so a developer can call them from Claude Code
(or any MCP client) without leaving their dev session:

> "What should I pick up next on the Lelanea project?" → `next_task`

Everything is **membership-scoped**: a tool only ever sees projects you're a member of
(enforced inside each capability via `canAccessProject` — [[f-access]]), so the MCP key just
identifies _you_; it doesn't grant broader access.

## What ships seeded vs. what an operator turns on

The `app/*` seeds create, for each Hub tool, an **active `AiCapability` row** (so it
dispatches) and a **pre-enabled `McpExposedTool` row** (so it's MCP-visible). But the MCP
**server itself ships disabled** (`prisma/seeds/008-mcp-server` → `mcpServerConfig.isEnabled:
false`) — a deliberate off-by-default posture. So a one-time operator step is required before
any tool is reachable over MCP.

## Enabling dev access (operator, once)

1. **Turn the MCP server on** — Admin → Orchestration → **MCP Server**, enable the global
   config. (The Hub tools are already exposed on the Tools page; no per-tool step needed.)
2. **Issue a per-developer MCP key** — create an **`McpApiKey`** (prefix `smcp_`) with the
   **`tools:execute`** scope (and `tools:list`). Optionally:
   - `scopedAgentId` — bind the key to a project's sidekick agent (once `f-sidekick` seeds
     them), so its cost/knowledge attribute to that agent and its per-agent tool disables apply;
   - `scope` (JSON, e.g. `{ "projectId": "…" }`) — threaded into the capability as
     `context.scope` for defence-in-depth. The real gate is your **membership**, checked
     server-side regardless of the key.

   > Note the two key systems are distinct: MCP uses **`McpApiKey` / `smcp_`**, _not_ the
   > self-service `AiApiKey` / `sk_` (which is for the consumer REST API). Use the MCP one.

## Connecting Claude Code

Add the Hub's MCP endpoint as a server in your Claude Code MCP config, authenticating with the
`smcp_` key as a bearer token. Once connected, `next_task` (and the write tools as they land —
`create_task`, `claim_task`, …) appear as tools; calls dispatch as **you**, membership-scoped.

_This guide grows as t-2/t-3 add the write + claim tools._
