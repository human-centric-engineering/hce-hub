import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `claim_feature` Hub lifecycle capability (f-feature-planning §18 t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `ClaimFeatureCapability.functionDefinition`
 * (pinned by feature-verbs.parity.test.ts).
 */
export const claimFeatureFunctionDefinition = {
  name: 'claim_feature',
  description:
    'Take ownership of a feature: sets you as its owner and moves it to in_flight. Any project member may claim. If it is already owned by someone else, the claim still succeeds but returns a soft warning.',
  parameters: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'The feature to claim ownership of.' },
    },
    required: ['featureId'],
  },
};

const unit: SeedUnit = {
  name: 'app/011-claim-feature',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding claim_feature Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'claim_feature' },
      update: { isSystem: true },
      create: {
        slug: 'claim_feature',
        name: 'Claim Feature',
        description:
          'Take ownership of a feature (owner + in_flight); soft-warns if already owned. Any member; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'ClaimFeatureCapability',
        functionDefinition: claimFeatureFunctionDefinition,
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
        customName: 'claim_feature',
        readOnlyHint: false, // mutates: sets owner + status
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded claim_feature capability + MCP exposure');
  },
};

export default unit;
