import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `complete_task` Hub lifecycle capability (f-status-model §20 t-38).
 * See `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `CompleteTaskCapability.functionDefinition`
 * (pinned by task-lifecycle-verbs.parity.test.ts).
 */
export const completeTaskFunctionDefinition = {
  name: 'complete_task',
  description:
    "Mark a task complete: moves it to merged and closes its active-work record. Any project member may complete a task in a feature they can see. Idempotent: a no-op if it's already merged. (f-github-sync will later do this automatically when the task's PR merges.)",
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to complete.' },
      projectId: {
        type: 'string',
        description: 'Optional: the task must belong to this project (guards an id mix-up).',
      },
    },
    required: ['taskId'],
  },
};

const unit: SeedUnit = {
  name: 'app/015-complete-task',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding complete_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'complete_task' },
      update: { isSystem: true },
      create: {
        slug: 'complete_task',
        name: 'Complete Task',
        description:
          'Finish a task: → merged, closing its active-work record. Any member; idempotent; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'CompleteTaskCapability',
        functionDefinition: completeTaskFunctionDefinition,
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
        customName: 'complete_task',
        readOnlyHint: false, // mutates: flips status, closes the active-work claim
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded complete_task capability + MCP exposure');
  },
};

export default unit;
