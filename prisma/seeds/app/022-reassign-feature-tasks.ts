import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `reassign_feature_tasks` Hub write capability (f-task-assignment §22 t2).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with the `ReassignFeatureTasksCapability` class by its parity
 * test, and re-synced on the update branch (the #108 fix) so a schema change reaches
 * the DB.
 */
export const reassignFeatureTasksFunctionDefinition = {
  name: 'reassign_feature_tasks',
  description:
    "Reassign a feature's remaining (unmerged) tasks to a project member — e.g. a teammate is away, so hand their outstanding work on this feature to someone else in one action. Merged tasks are left as-is (they credit whoever did them); feature ownership is never changed. Any project member may reassign; the assignee must be a project member. Active tasks handed to a different person are reset to claimed so the new person starts fresh.",
  parameters: {
    type: 'object',
    properties: {
      featureId: {
        type: 'string',
        description: 'The feature whose remaining (unmerged) tasks to reassign.',
      },
      assigneeUserId: {
        type: 'string',
        description: 'The project member to hand the remaining tasks to.',
      },
      projectId: {
        type: 'string',
        description: 'Optional: the feature must belong to this project (guards an id mix-up).',
      },
    },
    required: ['featureId', 'assigneeUserId'],
  },
};

const unit: SeedUnit = {
  name: 'app/022-reassign-feature-tasks',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding reassign_feature_tasks Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'reassign_feature_tasks' },
      update: { isSystem: true, functionDefinition: reassignFeatureTasksFunctionDefinition },
      create: {
        slug: 'reassign_feature_tasks',
        name: 'Reassign Feature Tasks',
        description:
          "Reassign a feature's remaining (unmerged) tasks to a project member (hand a teammate's outstanding work over). Membership-scoped; audited.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'ReassignFeatureTasksCapability',
        functionDefinition: reassignFeatureTasksFunctionDefinition,
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
        customName: 'reassign_feature_tasks',
        readOnlyHint: false, // mutates: sets the assignee on a feature's unmerged tasks
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded reassign_feature_tasks capability + MCP exposure');
  },
};

export default unit;
