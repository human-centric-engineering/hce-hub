import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `ship_feature` Hub lifecycle capability (f-feature-planning §18 t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `ShipFeatureCapability.functionDefinition`
 * (pinned by feature-verbs.parity.test.ts).
 */
export const shipFeatureFunctionDefinition = {
  name: 'ship_feature',
  description:
    'Mark a feature shipped with a closing summary (recorded to the journal). Only the feature owner or a project lead may ship. Unmerged tasks are a soft warning, never a block — done is human-judged.',
  parameters: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'The feature to ship.' },
      summary: { type: 'string', description: 'The closing narrative (markdown).' },
    },
    required: ['featureId', 'summary'],
  },
};

const unit: SeedUnit = {
  name: 'app/013-ship-feature',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding ship_feature Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'ship_feature' },
      update: { isSystem: true },
      create: {
        slug: 'ship_feature',
        name: 'Ship Feature',
        description:
          'Mark a feature shipped with a closing narrative (soft-warns on unmerged tasks). Owner/lead; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'ShipFeatureCapability',
        functionDefinition: shipFeatureFunctionDefinition,
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
        customName: 'ship_feature',
        readOnlyHint: false, // mutates: flips status + writes a journal entry
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded ship_feature capability + MCP exposure');
  },
};

export default unit;
