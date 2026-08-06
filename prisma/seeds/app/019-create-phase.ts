import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `create_phase` Hub capability (f-phases §22 t1) — add a phase
 * (roadmap band) to a project. See `app/001-next-task.ts` for the seam + parity
 * conventions. The `functionDefinition` MUST equal
 * `CreatePhaseCapability.functionDefinition` (pinned by create-phase.parity.test.ts).
 */
export const createPhaseFunctionDefinition = {
  name: 'create_phase',
  description:
    'Add a phase (roadmap band) to a project: an epic for a build project, a release band for a platform, or an idea park when parked. Appends after the existing phases unless an ordinal is given; status defaults to "upcoming" ("parked" hides it from active views). Any project member may create one.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The project to add the phase to.' },
      name: { type: 'string', description: 'The phase name (e.g. "v0.9.0", "Onboarding").' },
      description: {
        type: 'string',
        description: 'Optional description of what the phase covers (markdown).',
      },
      status: {
        type: 'string',
        enum: ['upcoming', 'active', 'complete', 'parked'],
        description:
          'Lifecycle status; defaults to "upcoming". "parked" hides it from active views.',
      },
      ordinal: {
        type: 'number',
        description: 'Explicit display position; defaults to appended after the last phase.',
      },
    },
    required: ['projectId', 'name'],
  },
};

const unit: SeedUnit = {
  name: 'app/019-create-phase',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding create_phase Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'create_phase' },
      update: { isSystem: true },
      create: {
        slug: 'create_phase',
        name: 'Create Phase',
        description:
          'Add a phase (roadmap band) to a project — epic, release band, or idea park. Member-tier; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'CreatePhaseCapability',
        functionDefinition: createPhaseFunctionDefinition,
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
        customName: 'create_phase',
        readOnlyHint: false, // creates a phase
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded create_phase capability + MCP exposure');
  },
};

export default unit;
