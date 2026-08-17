import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `record_decision` Hub journal capability (f-journal §17 t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions.
 */
export const recordDecisionFunctionDefinition = {
  name: 'record_decision',
  description:
    'Record a decision and its rationale into the project journal. Provide a featureId for a feature-level decision (planning rationale) or a projectId for a project-level architectural/process decision. Any project member may record one.',
  parameters: {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'The project for a project-level decision (omit when featureId is given).',
      },
      featureId: {
        type: 'string',
        description: 'The feature this decision concerns; its project is used (takes precedence).',
      },
      title: { type: 'string', description: 'A short heading for the decision.' },
      body: { type: 'string', description: 'The decision and its rationale (markdown).' },
      category: {
        type: 'string',
        description: 'Optional tag, e.g. "architecture" or "process".',
      },
    },
    required: ['title', 'body'],
  },
};

/**
 * Code-owned half of the capability row — must track `RecordDecisionCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const RECORD_DECISION_IMPL = {
  executionType: 'internal',
  executionHandler: 'RecordDecisionCapability',
  functionDefinition: recordDecisionFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/008-record-decision',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding record_decision Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'record_decision' },
      update: { isSystem: true, ...RECORD_DECISION_IMPL },
      create: {
        slug: 'record_decision',
        name: 'Record Decision',
        description:
          'Record a decision + rationale into the project journal (feature- or project-scoped). Any member; audited.',
        category: 'coordination',
        ...RECORD_DECISION_IMPL,
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
        customName: 'record_decision',
        readOnlyHint: false, // mutates: appends a decision event to the journal
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded record_decision capability + MCP exposure');
  },
};

export default unit;
