import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `create_feature` Hub lifecycle capability (f-feature-planning §18 t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `CreateFeatureCapability.functionDefinition`
 * (pinned by feature-verbs.parity.test.ts).
 */
export const createFeatureFunctionDefinition = {
  name: 'create_feature',
  description:
    'Author a feature into a project as an unowned, high-level sketch (planning + indicative). Carries title, optional slug/description/done-when/references, optional dependencies on existing features, and an optional indicative task sketch. Any project member may create one; claim it separately to take ownership.',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'The project to create the feature in.' },
      title: { type: 'string', description: 'The feature title.' },
      slug: {
        type: 'string',
        description: 'Optional short human key, unique within the project (e.g. "f-mcp").',
      },
      description: { type: 'string', description: 'Human-readable description (markdown).' },
      doneWhen: { type: 'string', description: "The feature's definition of done." },
      references: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Human label for the reference.' },
            target: { type: 'string', description: 'The target — a URL, doc path, or key.' },
          },
          required: ['label', 'target'],
        },
        description: 'Cross-references (label + target), rendered as chips.',
      },
      dependsOnFeatureIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ids of existing features in the same project this one depends on.',
      },
      indicativeTasks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional high-level task sketch (ordered free text; not claimable tasks).',
      },
    },
    required: ['projectId', 'title'],
  },
};

const unit: SeedUnit = {
  name: 'app/010-create-feature',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding create_feature Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'create_feature' },
      update: { isSystem: true },
      create: {
        slug: 'create_feature',
        name: 'Create Feature',
        description:
          'Author a feature into a project as an unowned, indicative sketch. Any member; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'CreateFeatureCapability',
        functionDefinition: createFeatureFunctionDefinition,
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
        customName: 'create_feature',
        readOnlyHint: false, // mutates: creates a feature (+ deps, indicative tasks)
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded create_feature capability + MCP exposure');
  },
};

export default unit;
