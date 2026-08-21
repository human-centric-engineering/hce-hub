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
    "Read a project's tasks — each with its t-N number, id, title, feature (id + slug), effective status (claimed | active | blocked | merged), kind (feature_work | bug | enhancement), the phase that chose it (phaseId; null = inherits its feature's phase), assignee id, and PR url. Narrow with featureId (one feature's tasks), kind (e.g. 'bug' for the open bugs, 'enhancement' for the open improvements), and/or status. Withdrawn tasks — work called off via withdraw_task — are excluded from every result unless you ask for them with status: 'withdrawn'; this is the only read that shows them, so it is how you find one to restore. Use it to see and name the same tasks/bugs the human sees on the board — e.g. before picking work up. On a large project, prefer narrowing with featureId or kind over reading every task. Membership-scoped: a project you can't see is not_found.",
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
        enum: ['claimed', 'active', 'blocked', 'merged', 'withdrawn'],
        description:
          'Optional: restrict to one effective status (blocked = deps not all merged; withdrawn = called off, and the only way to see it — every other read hides withdrawn work).',
      },
      kind: {
        type: 'string',
        enum: ['feature_work', 'bug', 'enhancement'],
        description:
          'Optional: restrict to one kind — e.g. "bug" for the open-bugs read, or "enhancement" for the open improvements.',
      },
    },
    required: ['projectId'],
  },
};

/**
 * Code-owned half of the capability row — must track `ListTasksCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const LIST_TASKS_IMPL = {
  executionType: 'internal',
  executionHandler: 'ListTasksCapability',
  functionDefinition: listTasksFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/027-list-tasks',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding list_tasks Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'list_tasks' },
      update: { isSystem: true, ...LIST_TASKS_IMPL },
      create: {
        slug: 'list_tasks',
        name: 'List Tasks',
        description:
          "Read a project's tasks (t-N, status, kind, assignee) — narrow by feature / kind / status. Membership-scoped.",
        category: 'coordination',
        ...LIST_TASKS_IMPL,
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
