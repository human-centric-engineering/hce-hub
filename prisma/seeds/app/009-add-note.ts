import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `add_note` Hub journal capability (f-journal §17 t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions.
 */
export const addNoteFunctionDefinition = {
  name: 'add_note',
  description:
    'Add a freeform note to the project journal (a heads-up, a link, a status aside — anything that is not a formal decision). Provide a featureId to scope it to a feature or a projectId for a project-level note. Any project member may add one.',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'The project for a project-level note (omit when featureId is given).',
      },
      featureId: {
        type: 'string',
        description: 'The feature this note concerns; its project is used (takes precedence).',
      },
      title: { type: 'string', description: 'An optional short heading.' },
      body: { type: 'string', description: 'The note (markdown).' },
    },
    required: ['body'],
  },
};

const unit: SeedUnit = {
  name: 'app/009-add-note',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding add_note Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'add_note' },
      update: { isSystem: true },
      create: {
        slug: 'add_note',
        name: 'Add Note',
        description:
          'Add a freeform note to the project journal (feature- or project-scoped). Any member; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'AddNoteCapability',
        functionDefinition: addNoteFunctionDefinition,
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
        customName: 'add_note',
        readOnlyHint: false, // mutates: appends a note event to the journal
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded add_note capability + MCP exposure');
  },
};

export default unit;
