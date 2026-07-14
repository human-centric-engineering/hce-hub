import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `add_backlog` Hub write capability (f-hub-capabilities t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions.
 */
export const addBacklogFunctionDefinition = {
  name: 'add_backlog',
  description:
    'Capture a thought as a backlog item against a feature, without switching context. Creates a task in the backlog (not yet available to pull). Any project member may add to the backlog.',
  parameters: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'The feature to add the backlog item to.' },
      title: { type: 'string', description: 'Short description of the backlog item.' },
    },
    required: ['featureId', 'title'],
  },
};

const unit: SeedUnit = {
  name: 'app/003-add-backlog',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding add_backlog Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'add_backlog' },
      update: { isSystem: true },
      create: {
        slug: 'add_backlog',
        name: 'Add to Backlog',
        description:
          'Drop a thought against a feature as a backlog task. Any project member; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'AddBacklogCapability',
        functionDefinition: addBacklogFunctionDefinition,
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
        customName: 'add_backlog',
        readOnlyHint: false, // mutates: creates a backlog task
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded add_backlog capability + MCP exposure');
  },
};

export default unit;
