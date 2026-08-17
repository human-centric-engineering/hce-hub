import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `list_ideas` Hub read capability (f-idea-capture §22 t-63).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `ListIdeasCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const listIdeasFunctionDefinition = {
  name: 'list_ideas',
  description:
    'Read a project\'s idea inbox — the actionable ideas (open, to triage; and dropped, the reversible archive) with their #N handle, id, status, and text. Promoted ideas are excluded. Use it to find the idea a human means by "promote #4", then pass its id as fromIdeaId to create_feature / create_task / create_phase. Membership-scoped: a project you can\'t see is not_found.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The project whose idea inbox to read.' },
    },
    required: ['projectId'],
  },
};

/**
 * Code-owned half of the capability row — must track `ListIdeasCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const LIST_IDEAS_IMPL = {
  executionType: 'internal',
  executionHandler: 'ListIdeasCapability',
  functionDefinition: listIdeasFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/026-list-ideas',
  async run({ prisma, logger }) {
    logger.info('💡 Seeding list_ideas Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'list_ideas' },
      update: { isSystem: true, ...LIST_IDEAS_IMPL },
      create: {
        slug: 'list_ideas',
        name: 'List Ideas',
        description:
          "Read a project's idea inbox (open + dropped) by #N handle, to find one to promote or triage. Membership-scoped.",
        category: 'coordination',
        ...LIST_IDEAS_IMPL,
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
        customName: 'list_ideas',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded list_ideas capability + MCP exposure');
  },
};

export default unit;
