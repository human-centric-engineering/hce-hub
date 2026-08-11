import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `list_tasks` Hub read capability (f-task-reads §30 t-67).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `ListTasksCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const listTasksFunctionDefinition = {
  name: 'list_tasks',
  description:
    "Read a project's tasks — each with its t-N number, id, title, feature (id + slug), effective status (claimed | active | blocked | merged), kind (bug | feature_work), assignee id, and PR url. Narrow with featureId (one feature's tasks), kind (e.g. 'bug' for the open bugs), and/or status. Use it to see and name the same tasks/bugs the human sees on the board — e.g. before picking work up. Membership-scoped: a project you can't see is not_found.",
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The project whose tasks to read.' },
      featureId: {
        type: 'string',
        description: 'Optional: restrict to one feature in the project.',
      },
      status: {
        type: 'string',
        enum: ['claimed', 'active', 'blocked', 'merged'],
        description: 'Optional: restrict to one effective status (blocked = deps not all merged).',
      },
      kind: {
        type: 'string',
        enum: ['feature_work', 'bug'],
        description: 'Optional: restrict to one kind — e.g. "bug" for the open-bugs read.',
      },
    },
    required: ['projectId'],
  },
};

const unit: SeedUnit = {
  name: 'app/027-list-tasks',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding list_tasks Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'list_tasks' },
      update: { isSystem: true, functionDefinition: listTasksFunctionDefinition },
      create: {
        slug: 'list_tasks',
        name: 'List Tasks',
        description:
          "Read a project's tasks (t-N, status, kind, assignee) — narrow by feature / kind / status. Membership-scoped.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'ListTasksCapability',
        functionDefinition: listTasksFunctionDefinition,
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
        customName: 'list_tasks',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded list_tasks capability + MCP exposure');
  },
};

export default unit;
