import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `list_events` Hub read capability (f-mcp-project-scope §31 t-70).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `ListEventsCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const listEventsFunctionDefinition = {
  name: 'list_events',
  description:
    "Read a project's journal (newest first, capped) — decisions, notes, and lifecycle events (claim / plan / ship / merge), each with its kind, actor, feature/task ref, authored title + body, and timestamp. Use it to catch up on what happened, or scope with featureId / taskId for one feature's activity or a task's timeline. Membership-scoped: a project you can't see is not_found.",
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description:
          'The project whose journal to read. Ambient for a project-scoped key; required otherwise.',
      },
      featureId: {
        type: 'string',
        description: 'Optional: scope to one feature (its events only).',
      },
      taskId: { type: 'string', description: 'Optional: scope to one task (its timeline).' },
    },
    required: [],
  },
};

const unit: SeedUnit = {
  name: 'app/032-list-events',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding list_events Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'list_events' },
      update: { isSystem: true, functionDefinition: listEventsFunctionDefinition },
      create: {
        slug: 'list_events',
        name: 'List Events',
        description:
          "Read a project's journal (decisions, notes, lifecycle events) over MCP; scope by feature/task. Membership-scoped.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'ListEventsCapability',
        functionDefinition: listEventsFunctionDefinition,
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
        customName: 'list_events',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded list_events capability + MCP exposure');
  },
};

export default unit;
