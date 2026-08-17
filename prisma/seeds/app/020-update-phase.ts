import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `update_phase` Hub capability (f-phases §22 t1) — edit an existing
 * phase's name, description, position, or lifecycle status. See
 * `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `UpdatePhaseCapability.functionDefinition`
 * (pinned by update-phase.parity.test.ts).
 */
export const updatePhaseFunctionDefinition = {
  name: 'update_phase',
  description:
    'Edit an existing phase: rename it, change its description, or advance its status (upcoming → active → complete, or park it). Only supplied fields change; a null description clears it. Any project member may edit a phase. (Reordering is a separate batch operation.)',
  parameters: {
    type: 'object',
    properties: {
      phaseId: { type: 'string', description: 'The phase to edit.' },
      name: { type: 'string', description: 'New phase name.' },
      description: {
        type: ['string', 'null'],
        description: 'New description (markdown); null clears it.',
      },
      status: {
        type: 'string',
        enum: ['upcoming', 'active', 'complete', 'parked'],
        description: 'New lifecycle status. "parked" hides it from active views.',
      },
    },
    required: ['phaseId'],
  },
};

/**
 * Code-owned half of the capability row — must track `UpdatePhaseCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const UPDATE_PHASE_IMPL = {
  executionType: 'internal',
  executionHandler: 'UpdatePhaseCapability',
  functionDefinition: updatePhaseFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/020-update-phase',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding update_phase Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'update_phase' },
      update: { isSystem: true, ...UPDATE_PHASE_IMPL },
      create: {
        slug: 'update_phase',
        name: 'Update Phase',
        description:
          "Edit an existing phase's name, description, position, or lifecycle status. Member-tier; audited.",
        category: 'coordination',
        ...UPDATE_PHASE_IMPL,
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
        customName: 'update_phase',
        readOnlyHint: false, // mutates the phase
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded update_phase capability + MCP exposure');
  },
};

export default unit;
