import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `next_task` Hub capability (f-hub-capabilities t-1).
 *
 * HCE Hub app seed — lives under `prisma/seeds/app/` (the runner's fork
 * subdirectory seam: recursively discovered, keyed by relative path so it never
 * collides with Sunrise's top-level `NNN-*.ts`, and runs AFTER all core seeds so
 * the MCP system agent / owner already exist).
 *
 * Registering the class in `lib/app/capabilities.ts` is not enough — the
 * dispatcher dies at `capability_inactive` without an active `AiCapability` row,
 * and the tool is invisible to MCP without an `McpExposedTool` row.
 *
 * As with Sunrise's built-in capability seeds (`011-call-external-api` …), the
 * `slug` + `functionDefinition` here are the DB copy, hand-kept in sync with the
 * `NextTaskCapability` class (which carries the same `functionDefinition` for the
 * in-memory handler). A `next-task.parity.test.ts` pins the two together so they
 * can't silently drift.
 *
 * Exposure posture: we pre-expose the Hub's own read tool (`isEnabled: true`),
 * but the MCP *server* ships disabled (`008-mcp-server`), so nothing is reachable
 * until an admin turns the server on — see `.context/app/mcp-claude-code.md`.
 * Idempotent — the `update` branch only re-pins `isSystem`, never overwriting
 * admin edits.
 */
/**
 * The DB copy of `next_task`'s function definition (what the dispatcher loads
 * and the LLM sees). Kept in sync with the `NextTaskCapability` class's own copy
 * by `next-task.parity.test.ts`. Left un-annotated so its inferred structural
 * type is assignable to the Prisma `Json` column.
 */
export const nextTaskFunctionDefinition = {
  name: 'next_task',
  description:
    "Recommend the single highest-priority task the caller can start next — a claimed task whose dependencies are all merged (nothing blocked by an open PR), in a feature the caller owns, or any help-wanted feature when includeHelpWanted is true. Membership-scoped: only the caller's projects are considered. A recommendation, not an assignment.",
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'Optional: restrict to one project the caller is a member of.',
      },
      includeHelpWanted: {
        type: 'boolean',
        description: "Optional: also consider help-wanted features, not just the caller's own.",
      },
    },
    required: [],
  },
};

const unit: SeedUnit = {
  name: 'app/001-next-task',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding next_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'next_task' },
      update: { isSystem: true },
      create: {
        slug: 'next_task',
        name: 'Next Task',
        description:
          "Recommend the caller's highest-priority pullable task — dependencies all merged, in a feature they own (or any help-wanted feature). Membership-scoped; a recommendation, not an assignment.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'NextTaskCapability',
        functionDefinition: nextTaskFunctionDefinition,
        isIdempotent: true, // pure read — the engine can skip the dispatch cache
        isActive: true,
        isSystem: true,
      },
    });

    await prisma.mcpExposedTool.upsert({
      where: { capabilityId: capability.id },
      update: {},
      create: {
        capabilityId: capability.id,
        isEnabled: true,
        customName: 'next_task',
        readOnlyHint: true, // pure read: does not modify state
        openWorldHint: false, // internal — no external world interaction
      },
    });

    logger.info('✅ Seeded next_task capability + MCP exposure');
  },
};

export default unit;
