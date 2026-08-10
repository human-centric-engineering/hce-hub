import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `capture_idea` Hub write capability (f-idea-capture §22-03 t-58).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with `CaptureIdeaCapability` by its parity test, and re-synced
 * on the update branch (the #108 fix) so a schema change reaches the DB.
 */
export const captureIdeaFunctionDefinition = {
  name: 'capture_idea',
  description:
    "Capture an idea or tweak without leaving your current work — jot a short line and it lands as an indicative feature stub in the project's parked phase (the Ideas Park), to triage later (promote into an active phase, or drop). Any project member may capture. The project must have a parked phase.",
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The project to capture the idea into.' },
      text: {
        type: 'string',
        description:
          'The idea — a short line; it becomes an indicative feature stub in the Ideas Park.',
      },
    },
    required: ['projectId', 'text'],
  },
};

const unit: SeedUnit = {
  name: 'app/024-capture-idea',
  async run({ prisma, logger }) {
    logger.info('💡 Seeding capture_idea Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'capture_idea' },
      update: { isSystem: true, functionDefinition: captureIdeaFunctionDefinition },
      create: {
        slug: 'capture_idea',
        name: 'Capture Idea',
        description:
          "Jot an idea into the project's parked phase (Ideas Park) as an indicative stub. Any member; audited.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'CaptureIdeaCapability',
        functionDefinition: captureIdeaFunctionDefinition,
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
        customName: 'capture_idea',
        readOnlyHint: false, // mutates: creates an indicative feature stub
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded capture_idea capability + MCP exposure');
  },
};

export default unit;
