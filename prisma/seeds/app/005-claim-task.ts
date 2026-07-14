import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `claim_task` Hub write capability (f-hub-capabilities t-3).
 * See `app/001-next-task.ts` for the seam + parity conventions.
 */
export const claimTaskFunctionDefinition = {
  name: 'claim_task',
  description:
    'Claim a task to signal you are working on it and register your files-in-flight. Always succeeds (never a hard lock); returns soft warnings if the task is already claimed or another open claim touches overlapping files. Any project member may claim.',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to claim.' },
    },
    required: ['taskId'],
  },
};

const unit: SeedUnit = {
  name: 'app/005-claim-task',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding claim_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'claim_task' },
      update: { isSystem: true },
      create: {
        slug: 'claim_task',
        name: 'Claim Task',
        description:
          'Claim a task (register files-in-flight) and get soft collision warnings. Any member; never a hard lock; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'ClaimTaskCapability',
        functionDefinition: claimTaskFunctionDefinition,
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
        customName: 'claim_task',
        readOnlyHint: false, // mutates: writes a claim + updates task status
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded claim_task capability + MCP exposure');
  },
};

export default unit;
