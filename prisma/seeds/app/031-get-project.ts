import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `get_project` Hub read capability (f-mcp-project-scope §31 t-70).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `GetProjectCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const getProjectFunctionDefinition = {
  name: 'get_project',
  description:
    "Read one project's header — id, slug, name, status, host platform, linked repo URLs, whether you're its lead — plus a structure roll-up (counts of phases, features, tasks, and open ideas). Use it after list_projects to orient before drilling into list_phases / get_feature. Membership-scoped: a project you can't see is not_found.",
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'The project to read. Ambient for a project-scoped key; required otherwise.',
      },
    },
    required: [],
  },
};

/**
 * Code-owned half of the capability row — must track `GetProjectCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const GET_PROJECT_IMPL = {
  executionType: 'internal',
  executionHandler: 'GetProjectCapability',
  functionDefinition: getProjectFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/031-get-project',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding get_project Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'get_project' },
      update: { isSystem: true, ...GET_PROJECT_IMPL },
      create: {
        slug: 'get_project',
        name: 'Get Project',
        description:
          "Read one project's header + structure counts (phases, features, tasks, open ideas) over MCP. Membership-scoped.",
        category: 'coordination',
        ...GET_PROJECT_IMPL,
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
        customName: 'get_project',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded get_project capability + MCP exposure');
  },
};

export default unit;
