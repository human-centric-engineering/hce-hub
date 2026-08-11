import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `get_task` Hub read capability (f-task-reads §30 t-68).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `GetTaskCapability` by its parity test, and re-synced on
 * the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const getTaskFunctionDefinition = {
  name: 'get_task',
  description:
    "Read one task's full detail — its description, acceptance contract (done-when), effective status, kind, file scope, PR url, feature (id + slug), and its dependency graph (blockedBy / blocks, each neighbour with its t-N + readiness). Use it after list_tasks to actually work a task you were handed by t-N — the detail list_tasks omits. Membership-scoped: a task you can't see (or in another project) is not_found.",
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to read.' },
      projectId: {
        type: 'string',
        description: 'Optional: the task must belong to this project (guards an id mix-up).',
      },
    },
    required: ['taskId'],
  },
};

const unit: SeedUnit = {
  name: 'app/028-get-task',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding get_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'get_task' },
      update: { isSystem: true, functionDefinition: getTaskFunctionDefinition },
      create: {
        slug: 'get_task',
        name: 'Get Task',
        description:
          "Read one task's full detail (description, done-when, deps) over MCP, to work it. Membership-scoped.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'GetTaskCapability',
        functionDefinition: getTaskFunctionDefinition,
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
        customName: 'get_task',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded get_task capability + MCP exposure');
  },
};

export default unit;
