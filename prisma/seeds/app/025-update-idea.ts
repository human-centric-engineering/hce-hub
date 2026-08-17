import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `update_idea` Hub write capability (f-idea-capture §22).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `UpdateIdeaCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const updateIdeaFunctionDefinition = {
  name: 'update_idea',
  description:
    "Edit an inbox idea's text and/or drop or restore it. Drop (status 'dropped') archives it — reversible, never deleted — and restore ('open') brings it back. Promotion into a feature/task/phase/bug is a separate action (create it with fromIdeaId). Any project member may.",
  parameters: {
    type: 'object',
    properties: {
      ideaId: { type: 'string', description: 'The idea to edit or drop/restore.' },
      text: { type: 'string', description: 'New idea text (refine the jot).' },
      status: {
        type: 'string',
        enum: ['open', 'dropped'],
        description:
          'Drop ("dropped") or restore ("open") the idea. Promotion is a separate action.',
      },
    },
    required: ['ideaId'],
  },
};

/**
 * Code-owned half of the capability row — must track `UpdateIdeaCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const UPDATE_IDEA_IMPL = {
  executionType: 'internal',
  executionHandler: 'UpdateIdeaCapability',
  functionDefinition: updateIdeaFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/025-update-idea',
  async run({ prisma, logger }) {
    logger.info('💡 Seeding update_idea Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'update_idea' },
      update: { isSystem: true, ...UPDATE_IDEA_IMPL },
      create: {
        slug: 'update_idea',
        name: 'Update Idea',
        description:
          "Edit an idea's text and/or drop/restore it (archive is reversible). Any member; audited.",
        category: 'coordination',
        ...UPDATE_IDEA_IMPL,
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
        customName: 'update_idea',
        readOnlyHint: false, // mutates: edits / drops / restores an idea
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded update_idea capability + MCP exposure');
  },
};

export default unit;
