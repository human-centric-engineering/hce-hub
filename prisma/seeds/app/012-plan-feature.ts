import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `plan_feature` Hub lifecycle capability (f-feature-planning §18 t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `PlanFeatureCapability.functionDefinition`
 * (pinned by feature-verbs.parity.test.ts).
 */
export const planFeatureFunctionDefinition = {
  name: 'plan_feature',
  description:
    "Materialise a feature's tasks: creates real tasks (numbered, born claimed and owned by the feature owner), wires their dependencies, replaces the indicative sketch, and marks the feature planned. Only the feature owner or a project lead may plan. A cyclic task batch is rejected.",
  parameters: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'The feature to plan (must be indicative).' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ref: {
              type: 'string',
              description: 'A batch-local id (e.g. "t1") other tasks in this batch can depend on.',
            },
            title: { type: 'string', description: 'The task title.' },
            doneWhen: { type: 'string', description: "The task's acceptance contract." },
            filesScope: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths/globs the task expects to touch (a soft-collision hint).',
            },
            dependsOn: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Refs of other tasks in this batch, or ids of existing tasks in the project.',
            },
          },
          required: ['ref', 'title'],
        },
        description: 'The real tasks to create for this feature.',
      },
    },
    required: ['featureId', 'tasks'],
  },
};

const unit: SeedUnit = {
  name: 'app/012-plan-feature',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding plan_feature Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'plan_feature' },
      update: { isSystem: true },
      create: {
        slug: 'plan_feature',
        name: 'Plan Feature',
        description:
          'Materialise a feature into real, numbered, owner-assigned tasks (replaces the sketch). Owner/lead; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'PlanFeatureCapability',
        functionDefinition: planFeatureFunctionDefinition,
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
        customName: 'plan_feature',
        readOnlyHint: false, // mutates: creates tasks + deps, replaces sketch, flips stage
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded plan_feature capability + MCP exposure');
  },
};

export default unit;
