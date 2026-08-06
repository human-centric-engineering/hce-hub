import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `update_feature` Hub capability (f-authoring-fidelity §21 t-e) — edit an
 * existing feature's fields, dependency edges, and ownership. See
 * `app/001-next-task.ts` for the seam + parity conventions. The
 * `functionDefinition` MUST equal `UpdateFeatureCapability.functionDefinition`
 * (pinned by update-feature.parity.test.ts).
 */
export const updateFeatureFunctionDefinition = {
  name: 'update_feature',
  description:
    "Edit an existing feature: title, summary, description (markdown), done-when, references; replace its dependency edges (rejected if it would create a cycle); unclaim (ownerUserId null) or reassign the owner (a project member); and file it under a phase (phaseId null to unfile). Only supplied fields change; a null summary/description/done-when/references clears it. Only the feature's owner or a project lead may edit it.",
  parameters: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'The feature to edit.' },
      title: { type: 'string', description: 'New title.' },
      summary: { type: 'string', description: 'New plain one-line summary; null clears it.' },
      description: { type: 'string', description: 'New full detail (markdown); null clears it.' },
      doneWhen: { type: 'string', description: 'New definition of done; null clears it.' },
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
        description: 'New cross-reference list — replaces the existing one; null clears it.',
      },
      dependsOnFeatureIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'New dependency set — replaces the existing edges (existing features in this project).',
      },
      ownerUserId: {
        type: 'string',
        description: 'Reassign the owner to a project member, or null to unclaim.',
      },
      phaseId: {
        type: 'string',
        description: 'File the feature under a phase in this project, or null to unfile it.',
      },
    },
    required: ['featureId'],
  },
};

const unit: SeedUnit = {
  name: 'app/018-update-feature',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding update_feature Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'update_feature' },
      update: { isSystem: true, functionDefinition: updateFeatureFunctionDefinition },
      create: {
        slug: 'update_feature',
        name: 'Update Feature',
        description:
          "Edit an existing feature's fields, dependency edges, and ownership. Owner-tier; cycle-guarded; audited.",
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'UpdateFeatureCapability',
        functionDefinition: updateFeatureFunctionDefinition,
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
        customName: 'update_feature',
        readOnlyHint: false, // mutates the feature's fields / edges / ownership
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded update_feature capability + MCP exposure');
  },
};

export default unit;
