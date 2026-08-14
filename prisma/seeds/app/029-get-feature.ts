import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `get_feature` Hub read capability (f-mcp-project-scope §31 t-70).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `GetFeatureCapability` by its parity test, and re-synced on
 * the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const getFeatureFunctionDefinition = {
  name: 'get_feature',
  description:
    "Read one feature's spec — its description, definition of done, effective status, planning stage (indicative sketch vs planned), the phase it is filed under, dependency graph (dependsOn / waitingOn), a task roll-up (total/merged count completion only: bugs and work raised after the feature shipped are excluded, and surface as openFixes/live instead — the same numbers the Plan shows), and any indicative-task sketch. Use it after list_phases to understand a feature before working it. featureRef is the feature's slug (e.g. 'f-mcp') or id. Membership-scoped: a feature you can't see (or in another project) is not_found.",
  parameters: {
    type: 'object',
    properties: {
      featureRef: {
        type: 'string',
        description: "The feature to read — its slug (e.g. 'f-mcp') or id.",
      },
      projectId: {
        type: 'string',
        description:
          'The project the feature belongs to. Ambient for a project-scoped key; required otherwise.',
      },
    },
    required: ['featureRef'],
  },
};

const unit: SeedUnit = {
  name: 'app/029-get-feature',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding get_feature Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'get_feature' },
      update: { isSystem: true, functionDefinition: getFeatureFunctionDefinition },
      create: {
        slug: 'get_feature',
        name: 'Get Feature',
        description:
          "Read one feature's spec (description, done-when, status, deps, task roll-up) over MCP. Membership-scoped.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'GetFeatureCapability',
        functionDefinition: getFeatureFunctionDefinition,
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
        customName: 'get_feature',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded get_feature capability + MCP exposure');
  },
};

export default unit;
