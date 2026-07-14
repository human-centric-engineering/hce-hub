import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `flag_help_wanted` Hub write capability (f-hub-capabilities t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions.
 */
export const flagHelpWantedFunctionDefinition = {
  name: 'flag_help_wanted',
  description:
    "Set or clear the help-wanted flag on a feature, signalling to other members that it's open for contribution. Only the feature's owner or a project lead may toggle it.",
  parameters: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'The feature to toggle help-wanted on.' },
      helpWanted: {
        type: 'boolean',
        description: 'Whether the feature wants help (true) or not (false).',
      },
    },
    required: ['featureId', 'helpWanted'],
  },
};

const unit: SeedUnit = {
  name: 'app/004-flag-help-wanted',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding flag_help_wanted Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'flag_help_wanted' },
      update: { isSystem: true },
      create: {
        slug: 'flag_help_wanted',
        name: 'Flag Help Wanted',
        description: 'Toggle the help-wanted flag on a feature. Owner/lead only; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'FlagHelpWantedCapability',
        functionDefinition: flagHelpWantedFunctionDefinition,
        isIdempotent: true, // setting to the current value is a no-op
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
        customName: 'flag_help_wanted',
        readOnlyHint: false, // mutates: updates the feature flag
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded flag_help_wanted capability + MCP exposure');
  },
};

export default unit;
