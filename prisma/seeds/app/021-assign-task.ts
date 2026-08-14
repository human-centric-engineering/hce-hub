import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `assign_task` Hub write capability (f-task-assignment t1).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with the `AssignTaskCapability` class by its parity test,
 * and re-synced on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const assignTaskFunctionDefinition = {
  name: 'assign_task',
  description:
    'Assign, reassign, or release a task: assigneeUserId to yourself to take it, to someone else to hand it over (e.g. a teammate is away), or null to return it to the unassigned pool for anyone to pick up. Any project member may assign; a named assignee must be a project member. Reassigning or releasing an active task resets it to claimed so the next person starts fresh; a merged task is left as-is (it credits whoever did it). Never changes feature ownership.',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to assign.' },
      assigneeUserId: {
        type: ['string', 'null'],
        description:
          'The project member to assign it to (yourself, or someone else), or null to return it to the unassigned pool.',
      },
      projectId: {
        type: 'string',
        description: 'Optional: the task must belong to this project (guards an id mix-up).',
      },
    },
    required: ['taskId', 'assigneeUserId'],
  },
};

const unit: SeedUnit = {
  name: 'app/021-assign-task',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding assign_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'assign_task' },
      update: { isSystem: true, functionDefinition: assignTaskFunctionDefinition },
      create: {
        slug: 'assign_task',
        name: 'Assign Task',
        description:
          'Assign or reassign a task to a project member (take it, or hand it over). Membership-scoped; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'AssignTaskCapability',
        functionDefinition: assignTaskFunctionDefinition,
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
        customName: 'assign_task',
        readOnlyHint: false, // mutates: sets the task's assignee
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded assign_task capability + MCP exposure');
  },
};

export default unit;
