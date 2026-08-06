import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `update_task` Hub capability (f-authoring-fidelity §21 t-b) — edit an
 * existing task's authored fields. See `app/001-next-task.ts` for the seam +
 * parity conventions. The `functionDefinition` MUST equal
 * `UpdateTaskCapability.functionDefinition` (pinned by update-task.parity.test.ts).
 */
export const updateTaskFunctionDefinition = {
  name: 'update_task',
  description:
    "Edit an existing task's fields: title, description (markdown), done-when (acceptance contract), and/or file scope. Only the fields you supply change; a null description/done-when clears it. Only the feature's owner or a project lead may edit its tasks. Does not change status.",
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to edit.' },
      title: { type: 'string', description: 'New title.' },
      description: {
        type: 'string',
        description: 'New full detail (markdown); null clears it.',
      },
      doneWhen: { type: 'string', description: 'New acceptance contract; null clears it.' },
      filesScope: {
        type: 'array',
        items: { type: 'string' },
        description: 'New file-scope list — replaces the existing one.',
      },
    },
    required: ['taskId'],
  },
};

const unit: SeedUnit = {
  name: 'app/017-update-task',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding update_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'update_task' },
      update: { isSystem: true, functionDefinition: updateTaskFunctionDefinition },
      create: {
        slug: 'update_task',
        name: 'Update Task',
        description:
          "Edit an existing task's title/description/done-when/file-scope. Owner-tier; no status change; audited.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'UpdateTaskCapability',
        functionDefinition: updateTaskFunctionDefinition,
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
        customName: 'update_task',
        readOnlyHint: false, // mutates the task's authored fields
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded update_task capability + MCP exposure');
  },
};

export default unit;
