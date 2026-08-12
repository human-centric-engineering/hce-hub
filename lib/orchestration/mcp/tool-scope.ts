/**
 * Project-scope folding for MCP tool calls (f-mcp-project-scope §31 t-A).
 *
 * A project-scoped MCP key carries `scope = { projectId }` (see
 * `McpApiKey.scope`, threaded into `CapabilityContext.scope`). This helper folds
 * that scope into a tool's arguments on the `tools/call` path so the key's
 * project becomes **ambient**: the caller need not pass `projectId`, and cannot
 * act on a different project through that key.
 *
 * Two rules, applied only when the target tool actually **accepts** a
 * `projectId` argument (its input schema declares the property):
 *
 * - **fill-if-absent** — a scoped key that omits `projectId` gets the key's
 *   project supplied. (An empty string counts as absent — an unset arg.)
 * - **cross-project guard** — an explicit `projectId` that is not exactly the
 *   key's scope (a different string, or any non-string) is a cross-project or
 *   malformed attempt; the fold flags it so the caller can reject the call
 *   rather than silently retarget it or lean on the verb's own validation.
 *
 * Contract: `scope.projectId` MUST be the project's **cuid** (`Project.id`), not
 * its slug — every verb resolves it through `getAccessibleProject`'s
 * `findUnique({ where: { id } })`, which is cuid-only. The key-minting flow
 * (t-C) stores the resolved id; this fold folds it in verbatim.
 *
 * The `toolAcceptsProjectId` gate matters for two reasons: verbs keyed on an
 * entity id (`taskId` / `featureId`) don't declare `projectId`, so folding it in
 * would be meaningless; and some built-in capabilities use a `.strict()` schema
 * that would *reject* an unexpected `projectId` key outright. Gating on the
 * declared property leaves both untouched.
 *
 * Unscoped keys (no `scope.projectId`) are returned unchanged — `projectId`
 * stays a required argument, exactly as before. This is MCP-dispatch-only; the
 * web and workflow paths dispatch capabilities directly and never pass here.
 */

/** Result of folding a scoped key's project into tool args. */
export interface ProjectScopeFold {
  /** The args to dispatch — with `projectId` filled from scope when it was absent. */
  args: Record<string, unknown>;
  /**
   * Set only when an explicit `projectId` contradicts the key's scope. The
   * caller MUST reject the call (a scoped key cannot reach another project).
   */
  crossProject?: { scoped: string; requested: string };
}

/**
 * Does a tool's JSON-schema `parameters` object declare a `projectId` property?
 * Defensive against the loose `Record<string, unknown>` shape of `inputSchema`.
 */
export function toolAcceptsProjectId(inputSchema: Record<string, unknown>): boolean {
  const properties = inputSchema.properties;
  if (!properties || typeof properties !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(properties, 'projectId');
}

/**
 * Fold a scoped key's `projectId` into tool args. See the module doc for rules.
 */
export function foldProjectScope(
  args: Record<string, unknown>,
  scope: Record<string, string> | undefined,
  acceptsProjectId: boolean
): ProjectScopeFold {
  const scoped = scope?.projectId;

  // No project scope on the key, or a tool that doesn't take a project → nothing
  // to fold. Unscoped keys keep today's behaviour verbatim.
  if (!scoped || !acceptsProjectId) return { args };

  const provided = args.projectId;

  // Absent (or an empty-string placeholder) → supply the key's project.
  if (provided === undefined || provided === null || provided === '') {
    return { args: { ...args, projectId: scoped } };
  }

  // Anything else present must be EXACTLY the key's project. A different string,
  // or a non-string (`{}`, `['other']`, a number), is a cross-project or
  // malformed attempt → reject here rather than leaning on each verb's own Zod
  // schema, so the scope guarantee is self-contained (enforced where it is
  // stated, not one layer downstream).
  if (provided !== scoped) {
    return {
      args,
      crossProject: {
        scoped,
        requested: typeof provided === 'string' ? provided : JSON.stringify(provided),
      },
    };
  }

  // Present and matching → pass through unchanged.
  return { args };
}
