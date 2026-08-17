import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `list_projects` Hub read capability (f-mcp-project-scope §31 t-70).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `ListProjectsCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const listProjectsFunctionDefinition = {
  name: 'list_projects',
  description:
    "List the projects you can access — each with its id, slug, name, status, host platform, linked repo URLs, and whether you're its lead. The entry point of the read chain: use it to find a projectId, then list_phases / get_feature / list_tasks. A project-scoped key sees only its own project; an unscoped key sees every project you're a member of.",
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/**
 * Code-owned half of the capability row — must track `ListProjectsCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const LIST_PROJECTS_IMPL = {
  executionType: 'internal',
  executionHandler: 'ListProjectsCapability',
  functionDefinition: listProjectsFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/030-list-projects',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding list_projects Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'list_projects' },
      update: { isSystem: true, ...LIST_PROJECTS_IMPL },
      create: {
        slug: 'list_projects',
        name: 'List Projects',
        description:
          'List the projects you can access over MCP (id, slug, status, repo URLs, isLead). The read chain entry point. Membership-scoped.',
        category: 'coordination',
        ...LIST_PROJECTS_IMPL,
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
        customName: 'list_projects',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded list_projects capability + MCP exposure');
  },
};

export default unit;
