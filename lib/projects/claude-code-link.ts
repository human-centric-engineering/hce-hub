/**
 * "Open in Claude Code" command builder (f-task-sheet §11 t-3).
 *
 * The design's "Open in Claude Code" action assumed a deep-link, but the Hub's
 * Claude Code integration is **MCP**, not a URL scheme (`.context/app/mcp-claude-code.md`):
 * a developer connects the Hub's MCP server with an `smcp_` key, then drives the
 * membership-scoped tools (`claim_task`, `next_task`, …) in natural language.
 * There is no `claudecode://` deep-link to open. So instead of fabricating one,
 * this composes a ready-to-paste **prompt** the developer drops into a Claude
 * Code session (with the Hub MCP connected) to pick the task up via `claim_task`.
 * A pure string builder — no I/O, safe to import client-side.
 */

/** Compose the Claude Code prompt that claims + starts this task via the Hub MCP tools. */
export function buildClaudeCodeCommand(task: {
  number: number | null;
  title: string;
  featureSlug: string | null;
}): string {
  const ref = task.number != null ? `task t-${task.number}` : `the task "${task.title}"`;
  const feature = task.featureSlug ? ` in feature ${task.featureSlug}` : '';
  return `Using the HCE Hub MCP tools, claim ${ref} ("${task.title}")${feature}, then help me implement it.`;
}
