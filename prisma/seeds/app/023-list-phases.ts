import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `list_phases` Hub read capability (f-idea-capture §22-03 t-57).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `ListPhasesCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const listPhasesFunctionDefinition = {
  name: 'list_phases',
  description:
    "Read a project's structure — its phases (with ids, names, status, lifecycle dates, and the authored description saying why the grouping exists) and the features filed under each (with ids, slugs, numbers, status), plus a residual bucket (phase id null) for features not filed under any phase. Use it to discover the phase id to file a feature into, a phase's intent before committing work to it, or a feature's id to act on. Membership-scoped: a project you can't see is not_found.",
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The project whose phases + features to read.' },
    },
    required: ['projectId'],
  },
};

/**
 * Code-owned half of the capability row — must track `ListPhasesCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const LIST_PHASES_IMPL = {
  executionType: 'internal',
  executionHandler: 'ListPhasesCapability',
  functionDefinition: listPhasesFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/023-list-phases',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding list_phases Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'list_phases' },
      update: { isSystem: true, ...LIST_PHASES_IMPL },
      create: {
        slug: 'list_phases',
        name: 'List Phases',
        description:
          "Read a project's phases and the features filed under each (ids, slugs, status). Membership-scoped.",
        category: 'coordination',
        ...LIST_PHASES_IMPL,
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
        customName: 'list_phases',
        readOnlyHint: true, // a pure read — no mutation
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded list_phases capability + MCP exposure');
  },
};

export default unit;
