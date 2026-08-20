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
    "Read one feature's spec — its description, definition of done, effective status, planning stage (indicative sketch vs planned), the phase it is filed under, dependency graph (dependsOn / waitingOn), a task roll-up, and any indicative-task sketch. The roll-up: total/merged count completion only — bugs, and any work raised after the feature shipped, are excluded from it. Every open task falls into exactly ONE of (total − merged), openBugs, or openSinceShip. live/blocked are descriptive overlays and DO overlap those terms, so never add them in. unstartedSinceShip is the not-yet-started subset of openSinceShip, and is the number the Plan row shows as '· N new'. Use it after list_phases to understand a feature before working it. featureRef is the feature's slug (e.g. 'f-mcp') or id. Membership-scoped: a feature you can't see (or in another project) is not_found.",
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

/**
 * Code-owned half of the capability row — must track `GetFeatureCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const GET_FEATURE_IMPL = {
  executionType: 'internal',
  executionHandler: 'GetFeatureCapability',
  functionDefinition: getFeatureFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/029-get-feature',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding get_feature Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'get_feature' },
      update: { isSystem: true, ...GET_FEATURE_IMPL },
      create: {
        slug: 'get_feature',
        name: 'Get Feature',
        description:
          "Read one feature's spec (description, done-when, status, deps, task roll-up) over MCP. Membership-scoped.",
        category: 'coordination',
        ...GET_FEATURE_IMPL,
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
