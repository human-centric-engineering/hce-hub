import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `start_task` Hub lifecycle capability (f-status-model §20 t-38).
 * See `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `StartTaskCapability.functionDefinition`
 * (pinned by task-lifecycle-verbs.parity.test.ts).
 */
export const startTaskFunctionDefinition = {
  name: 'start_task',
  description:
    "Start a task you're picking up: moves it claimed → active and records you as the active worker. Any project member may start a task in a feature they can see (you claim features, but drive individual tasks with start/complete). Returns advisory file-overlap warnings against others' active work — never a block. Idempotent: a no-op if the task is already merged.",
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to start.' },
      projectId: {
        type: 'string',
        description: 'Optional: the task must belong to this project (guards an id mix-up).',
      },
    },
    required: ['taskId'],
  },
};

const unit: SeedUnit = {
  name: 'app/014-start-task',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding start_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'start_task' },
      update: { isSystem: true },
      create: {
        slug: 'start_task',
        name: 'Start Task',
        description:
          'Begin work on a task: claimed → active, crediting the caller as the active worker. Any member; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'StartTaskCapability',
        functionDefinition: startTaskFunctionDefinition,
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
        customName: 'start_task',
        readOnlyHint: false, // mutates: flips status, opens an active-work claim
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded start_task capability + MCP exposure');
  },
};

export default unit;
