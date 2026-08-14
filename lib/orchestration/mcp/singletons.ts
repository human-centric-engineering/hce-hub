/**
 * MCP runtime singletons.
 *
 * Extracted out of `index.ts` so leaf modules (protocol-handler, registry
 * helpers) can grab the session manager / rate limiter without dragging
 * the full re-export barrel into a cycle.
 *
 * Platform-agnostic: no Next.js imports.
 */

import { McpSessionManager } from '@/lib/orchestration/mcp/session-manager';
import { McpRateLimiter } from '@/lib/orchestration/mcp/rate-limiter';
import { env } from '@/lib/env';

/**
 * `MCP_SESSION_MODE=stateful` keeps sessions in this process's memory, which is
 * only correct when there is exactly one process. Where several serve traffic,
 * each gets its own empty `Map`, so a session created by `initialize` is
 * invisible to whichever instance serves the next call — the handshake fails
 * intermittently, disguised as session expiry, and only under concurrency. Fail
 * at startup with the fix rather than let that reach production, matching the
 * `TENANCY_MODE` seam in `lib/db/client.ts`.
 *
 * **This guard is a safety net, not a boundary.** The real criterion is "more
 * than one process", which is not detectable from inside one of them: a
 * Kubernetes Deployment with `replicas: 2`, an autoscaled Render/Fly/ECS
 * service, or a clustered Node process hits exactly the same bug and is not
 * caught here. Only the two function-per-request platforms that announce
 * themselves are. `||` rather than `??` — an empty-string `VERCEL=""` is falsy
 * but not nullish, so `??` would short-circuit and skip the Lambda check.
 */
const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
if (env.MCP_SESSION_MODE === 'stateful' && SERVERLESS) {
  throw new Error(
    'MCP_SESSION_MODE=stateful holds sessions in per-process memory and cannot work where ' +
      'more than one process serves traffic: consecutive requests land on different ' +
      'instances, so the session from `initialize` is not found and the client cannot ' +
      'connect. Use MCP_SESSION_MODE=stateless (the default), which needs no shared state ' +
      '— at the cost of SSE, resources/subscribe and logging/setLevel. If you need those ' +
      'here, sessions must move to a shared store (see .context/orchestration/mcp.md). ' +
      'This check only catches platforms that announce themselves; a multi-replica ' +
      'container deploy hits the same bug undetected.'
  );
}

let sessionManager: McpSessionManager | null = null;
let rateLimiter: McpRateLimiter | null = null;

export function getMcpSessionManager(): McpSessionManager {
  if (!sessionManager) {
    sessionManager = new McpSessionManager();
  }
  return sessionManager;
}

export function getMcpRateLimiter(): McpRateLimiter {
  if (!rateLimiter) {
    rateLimiter = new McpRateLimiter();
  }
  return rateLimiter;
}

/** Test/shutdown helper — destroys the underlying managers and clears the singletons. */
export function resetMcpSingletons(): void {
  if (sessionManager) {
    sessionManager.destroy();
    sessionManager = null;
  }
  rateLimiter = null;
}
