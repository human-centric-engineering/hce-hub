import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `update_task` Hub capability (f-authoring-fidelity §21 t-b) — edit an
 * existing task's authored fields. See `app/001-next-task.ts` for the seam +
 * parity conventions. The `functionDefinition` MUST equal
 * `UpdateTaskCapability.functionDefinition` (pinned by update-task.parity.test.ts).
 */
export const updateTaskFunctionDefinition = {
  name: 'update_task',
  description:
    "Edit an existing task's fields: title, description (markdown), done-when (acceptance contract), file scope, kind (re-file a mis-filed task, e.g. bug → enhancement), phase commitment (the phase that chose the work; null clears it so it inherits its feature's phase), and/or its dependencies (replaces the existing edges; rejected if it would create a cycle). Only the fields you supply change; a null description/done-when clears it. Only the feature's owner or a project lead may edit its tasks. Does not change status.",
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task to edit.' },
      title: { type: 'string', description: 'New title.' },
      description: {
        type: ['string', 'null'],
        description: 'New full detail (markdown); null clears it.',
      },
      doneWhen: {
        type: ['string', 'null'],
        description: 'New acceptance contract; null clears it.',
      },
      filesScope: {
        type: 'array',
        items: { type: 'string' },
        description: 'New file-scope list — replaces the existing one.',
      },
      dependsOnTaskIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'New dependency set — replaces the existing edges (existing tasks in this project). An empty array clears them.',
      },
      kind: {
        type: 'string',
        enum: ['feature_work', 'bug', 'enhancement'],
        description:
          "Re-file the task's kind: 'feature_work', 'bug', or 'enhancement'. Use it to correct work mis-filed as a bug that is really an improvement.",
      },
      phaseId: {
        type: ['string', 'null'],
        description:
          "Commit this task to a phase in this project — the phase that chose to do the work, when that differs from its feature's phase. Null clears the commitment, so the task inherits its feature's phase again.",
      },
    },
    required: ['taskId'],
  },
};

/**
 * Code-owned half of the capability row — must track `UpdateTaskCapability`, so the
 * seed re-applies it to rows that already exist rather than writing it on
 * `create` only. A stale `functionDefinition` is not an admin customisation:
 * it is the schema every MCP client is shown (Sunrise #545).
 */
const UPDATE_TASK_IMPL = {
  executionType: 'internal',
  executionHandler: 'UpdateTaskCapability',
  functionDefinition: updateTaskFunctionDefinition,
};

const unit: SeedUnit = {
  name: 'app/017-update-task',
  async run({ prisma, logger }) {
    logger.info('🌱 Seeding update_task Hub capability...');

    // The `update` branch deliberately re-syncs ONLY `functionDefinition` (a pure
    // code projection — the MCP tool list serves it, and a parity test pins it
    // equal to the class), never `description`. `AiCapability.description` is
    // operator-owned — editable via `/api/v1/admin/orchestration/capabilities/[id]`
    // — so rewriting it here would clobber an operator's edit on every `db:seed`
    // (planning-retro B10: classify the row before reconciling it). Consequence,
    // and it is the intended one: edits to the `description` below reach fresh
    // installs only; existing dev/prod rows keep whatever the operator last saw.
    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'update_task' },
      update: { isSystem: true, ...UPDATE_TASK_IMPL },
      create: {
        slug: 'update_task',
        name: 'Update Task',
        description:
          "Edit an existing task's title/description/done-when/file-scope, and replace its dependency edges (cycle-guarded). Owner-tier; no status change; audited.",
        category: 'coordination',
        ...UPDATE_TASK_IMPL,
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
        customName: 'update_task',
        readOnlyHint: false, // mutates the task's authored fields
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded update_task capability + MCP exposure');
  },
};

export default unit;
