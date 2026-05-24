# MCP Server

Model Context Protocol (MCP) server that lets external AI clients (Claude Desktop, Cursor, custom agents) connect to Sunrise and use its tools, data, and prompts.

## Architecture

```
Client (Claude Desktop / Cursor / custom)
  |
  | JSON-RPC 2.0 over HTTP
  v
POST /api/v1/mcp           ← Streamable HTTP transport
  |
  |-- IP rate limit (apiLimiter)
  |-- Bearer auth (smcp_ key → SHA-256 → McpApiKey lookup)
  |-- isEnabled check (McpServerConfig singleton)
  |-- JSON-RPC envelope validation
  |-- Session management (Mcp-Session-Id header)
  v
lib/orchestration/mcp/protocol-handler.ts
  |
  |-- tools/list  → tool-registry.ts → McpExposedTool + AiCapability
  |-- tools/call  → tool-registry.ts → capabilityDispatcher.dispatch()
  |-- resources/* → resource-registry.ts → sunrise:// URI handlers
  |-- prompts/*   → prompt-registry.ts → hardcoded templates
  v
Audit log (fire-and-forget → McpAuditLog)
```

## Key Files

| Area          | Files                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Core library  | `lib/orchestration/mcp/` (11 files, platform-agnostic)                      |
| Transport     | `app/api/v1/mcp/route.ts` (POST/GET/DELETE)                                 |
| Admin API     | `app/api/v1/admin/orchestration/mcp/` (10 route files)                      |
| Admin UI      | `app/admin/orchestration/mcp/` (6 pages)                                    |
| Components    | `components/admin/orchestration/mcp/` (7 components)                        |
| Types         | `types/mcp.ts`                                                              |
| Validation    | `lib/validations/mcp.ts`                                                    |
| Prisma models | McpServerConfig, McpExposedTool, McpExposedResource, McpApiKey, McpAuditLog |

## Security Model

| Layer              | Mechanism                                                                               |
| ------------------ | --------------------------------------------------------------------------------------- |
| Auth               | Bearer token (`smcp_` prefix, SHA-256 hashed), scope-based                              |
| Master switch      | `McpServerConfig.isEnabled` — 503 when off                                              |
| Default-deny       | Everything disabled by default; each tool/resource must be explicitly enabled           |
| Rate limiting      | IP-level (100/min) -> per-key (configurable) -> per-tool (via dispatcher)               |
| Input validation   | JSON-RPC envelope (Zod) -> tool args (JSON Schema + Zod in dispatcher)                  |
| SSRF prevention    | Resource URIs pattern-matched against registered set; no user URL reaches `fetch()`     |
| Audit              | Every MCP call logged with IP, duration, method, result code. Manual purge via admin UI |
| Error sanitization | JSON-RPC errors never leak internals in production                                      |
| Body size limit    | POST bodies &gt; 1MB (via `content-length`) → 413 before JSON parsing                   |

### Body size limit (413)

`app/api/v1/mcp/route.ts` rejects POST bodies whose `content-length` header exceeds 1 MB with a 413 and a JSON-RPC error envelope, before any JSON parsing runs. This branch is **covered by integration/e2e tests only**: jsdom treats `content-length` as a forbidden request header when it doesn't match the body length and strips it, so a unit test cannot observe the real HTTP server behaviour. The unit test file parks this case as `it.todo` with a `// SOURCE DECISION: Document` marker pointing back here.

## API Key Lifecycle

1. Admin creates key via UI or `POST /api/v1/admin/orchestration/mcp/keys`
2. Plaintext returned **once** (format: `smcp_<base62>`), SHA-256 hash stored
3. Client uses `Authorization: Bearer smcp_...` header
4. Scopes control access: `tools:list`, `tools:execute`, `resources:read`, `prompts:read`
5. Keys can be revoked immediately; `expiresAt` for automatic expiry
6. **Key rotation:** `POST /api/v1/admin/orchestration/mcp/keys/:id/rotate` — generates new key material, returns new plaintext once, immediately invalidates the old key. Optionally set `{ expiresAt }` in the body.

## Tool Exposure Flow

1. Admin enables a capability as an MCP tool via the Tools page
2. `McpExposedTool` row links to `AiCapability` with `isEnabled: true`
3. `tools/list` joins both tables, serves only doubly-enabled tools
4. `tools/call` dispatches through `capabilityDispatcher.dispatch()` using the `mcp-system` agent
5. Full 9-step pipeline applies: validation, rate limiting, execution, cost tracking

If `capabilityDispatcher.dispatch()` throws an unexpected exception (as opposed to returning `{ success: false }`), `callMcpTool` catches it and returns an MCP error content block (`isError: true`) with a generic message rather than escalating to a JSON-RPC protocol error.

## Resource Handlers

| Type               | URI Pattern                             | Handler                          |
| ------------------ | --------------------------------------- | -------------------------------- |
| `knowledge_search` | `sunrise://knowledge/search?q={query}`  | Delegates to `searchKnowledge()` |
| `pattern_detail`   | `sunrise://knowledge/patterns/{number}` | Queries AiKnowledgeChunk         |
| `agent_list`       | `sunrise://agents`                      | Active agents list               |
| `workflow_list`    | `sunrise://workflows`                   | Active workflows list            |

Each `McpExposedResource` has an optional `handlerConfig` JSON field passed to the resource handler as its second argument, allowing per-resource configuration (e.g., custom search parameters, filters). Stored as Prisma JSON and validated as `Record<string, unknown> | null`.

When a URI does not match any registered resource exactly, `readMcpResource` falls back to pattern matching against all enabled resources. Pattern matching uses first-match-wins order (database insertion order). If multiple resource patterns could match the same URI, the first match is used. Both exact and pattern-match handler calls are wrapped in try-catch — handler failures return an error content block instead of propagating.

## Session Management

- In-memory `Map<string, McpSession>`, 1hr TTL
- Created on `initialize`, identified by `Mcp-Session-Id` header
- `maxSessionsPerKey` enforced per API key
- Sessions lost on restart (clients re-initialize per MCP spec)
- Expired sessions are evicted lazily on `getSession()` access, not by a proactive timer — an expired session may still appear in the admin sessions list until it is next accessed or the list is refreshed
- Admin can force-terminate sessions via `DELETE /api/v1/admin/orchestration/mcp/sessions/:id` or the Sessions page UI

## Admin Pages

| Path                                 | Purpose                                            |
| ------------------------------------ | -------------------------------------------------- |
| `/admin/orchestration/mcp`           | Dashboard: master toggle, stats, connection config |
| `/admin/orchestration/mcp/tools`     | Enable/disable capabilities as MCP tools           |
| `/admin/orchestration/mcp/resources` | Enable/disable data resources                      |
| `/admin/orchestration/mcp/keys`      | Create/revoke API keys                             |
| `/admin/orchestration/mcp/audit`     | Audit log with manual purge button                 |
| `/admin/orchestration/mcp/settings`  | Rate limits, session limits, retention             |

## MCP Protocol Compliance

- Transport: Streamable HTTP
- Protocol versions: `2025-06-18` (latest) and `2024-11-05` (back-compat). Negotiated per session during `initialize`.
- Messages: JSON-RPC 2.0 (single and batch requests)
- Capabilities advertised: `tools.listChanged`, `resources.listChanged`. `prompts.listChanged`, `resources.subscribe`, `logging`, and `completions` land in subsequent phases — the server never advertises a capability it cannot serve.
- Resource templates: `resources/templates/list` advertises parameterized URI patterns
- Pagination: `tools/list` and `resources/list` support cursor-based pagination (50 items/page)
- Batch requests: JSON-RPC 2.0 array batches (max 20 requests per batch)
- SSE notifications: `notifications/tools/list_changed` and `notifications/resources/list_changed` pushed to connected clients when admin toggles tools/resources
- Client notifications accepted: `notifications/initialized`, `notifications/roots/list_changed`, `notifications/cancelled`

### Version negotiation

`initialize` reads the client's requested `protocolVersion` and chooses the response per these rules:

| Client sends                                        | Server responds with            | Why                                                    |
| --------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| A supported version (`2025-06-18` or `2024-11-05`)  | The same version                | Honour explicit choice                                 |
| No `protocolVersion` field                          | Oldest supported (`2024-11-05`) | Conservative default — likely a pre-negotiation client |
| A forward-dated unknown version (e.g. `2099-01-01`) | Latest supported (`2025-06-18`) | Graceful downgrade for newer clients                   |
| Any other unknown / malformed value                 | `INVALID_PARAMS` error          | Surface mismatch rather than silently misbehave        |

The negotiated version is stored on the session (`McpSession.protocolVersion`) and is available to per-call handlers for branching on features that exist only in newer revisions. The legacy `MCP_PROTOCOL_VERSION` export still resolves to the oldest supported version so downstream imports keep working.

### Authentication challenge (WWW-Authenticate)

401 responses include `WWW-Authenticate: Bearer realm="sunrise-mcp", error="invalid_token"` (RFC 6750 / RFC 9728). 2025-spec MCP clients use this to detect that the server is bearer-only and skip the OAuth discovery dance. OAuth 2.1 + DCR is captured as a separate roadmap item (see "Authentication" section below — to be added in Phase 7).

### Error codes

| Code   | Name              | Meaning                                                                                                  |
| ------ | ----------------- | -------------------------------------------------------------------------------------------------------- |
| -32700 | PARSE_ERROR       | Body is not valid JSON, or body exceeds the 1 MB size cap                                                |
| -32600 | INVALID_REQUEST   | JSON-RPC envelope is malformed, batch is empty / too large, or `initialize` is mixed with other requests |
| -32601 | METHOD_NOT_FOUND  | Unknown method                                                                                           |
| -32602 | INVALID_PARAMS    | Method-specific param validation failed                                                                  |
| -32603 | INTERNAL_ERROR    | Unhandled server error (no internals leaked)                                                             |
| -32001 | UNAUTHORIZED      | Missing / invalid bearer token (paired with HTTP 401 + `WWW-Authenticate`)                               |
| -32002 | SESSION_NOT_FOUND | Unknown / expired `Mcp-Session-Id`, or session belongs to a different key                                |
| -32003 | SERVER_DISABLED   | Master `isEnabled` toggle is off                                                                         |
| -32004 | RATE_LIMITED      | Per-key or global rate limit exceeded — client should back off and retry                                 |

## Client Configuration

Claude Desktop example (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sunrise": {
      "url": "https://your-app.com/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer smcp_your_key_here"
      }
    }
  }
}
```

## No External Dependencies

JSON-RPC 2.0 is hand-rolled (~100 lines of types). Crypto uses Node.js built-in `crypto`. SSE reuses `lib/api/sse.ts`. Rate limiting reuses `lib/security/rate-limit.ts`.
