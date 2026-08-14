import type { SeedUnit } from '@/prisma/runner';

/**
 * Seed the `create_task` Hub write capability (f-hub-capabilities t-2).
 * See `app/001-next-task.ts` for the seam + parity conventions. `functionDefinition`
 * is hand-kept in sync with the `CreateTaskCapability` class by its parity test.
 */
export const createTaskFunctionDefinition = {
  name: 'create_task',
  description:
    "Add a task to a feature you own (or lead): declares its title, optional description + acceptance contract (done-when), optional file scope, and optional dependencies on existing tasks. The task is born claimed and owned by the feature owner (blocked until its dependencies merge). Only the feature's owner or a project lead may create tasks. The result includes the created task id + assigned t-N (report it without a re-read).",
  parameters: {
    type: 'object',
    properties: {
      featureId: { type: 'string', description: 'The feature to add the task to.' },
      title: { type: 'string', description: 'Short description of the task.' },
      description: {
        type: 'string',
        description: 'Full task detail (markdown) — what to build and why.',
      },
      doneWhen: { type: 'string', description: "The task's acceptance contract." },
      filesScope: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional paths/globs the task expects to touch (a soft-collision hint).',
      },
      dependsOnTaskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional ids of existing tasks in the same project this task depends on.',
      },
      kind: {
        type: 'string',
        enum: ['feature_work', 'bug', 'enhancement'],
        description:
          "Optional task kind — 'bug' for a defect on the feature it broke (prioritised by next_task, kept out of completion progress and tallied as an open fix); 'enhancement' for a task-sized improvement to work that already exists; defaults to 'feature_work'. Work raised after its feature shipped never counts toward that feature's completion, whatever its kind — so file an improvement as 'enhancement', not as a 'bug'.",
      },
      fromIdeaId: {
        type: 'string',
        description:
          'Optional: the id of an open idea in this project being promoted into this task — it is marked promoted and linked, atomically. Use with kind:"bug" to promote an idea straight to a bug.',
      },
    },
    required: ['featureId', 'title'],
  },
};

const unit: SeedUnit = {
  name: 'app/002-create-task',
  async run({ prisma, logger }) {
    logger.info('🧭 Seeding create_task Hub capability...');

    const capability = await prisma.aiCapability.upsert({
      where: { slug: 'create_task' },
      update: { isSystem: true, functionDefinition: createTaskFunctionDefinition },
      create: {
        slug: 'create_task',
        name: 'Create Task',
        description:
          'Promote a planned task into a feature you own or lead (title, files, deps). Membership- and owner-scoped; audited.',
        category: 'coordination',
        executionType: 'internal',
        executionHandler: 'CreateTaskCapability',
        functionDefinition: createTaskFunctionDefinition,
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
        customName: 'create_task',
        readOnlyHint: false, // mutates: creates a task + dependency edges
        openWorldHint: false,
      },
    });

    logger.info('✅ Seeded create_task capability + MCP exposure');
  },
};

export default unit;
