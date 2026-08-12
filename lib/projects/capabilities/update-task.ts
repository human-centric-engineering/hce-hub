/**
 * `update_task` — edit an existing task's authored fields (f-authoring-fidelity
 * §21 t-b). The MCP verb that lets the record be *corrected from the Hub* rather
 * than the DB: `title`, `description`, `doneWhen`, `filesScope`. A `note`-style
 * amendment, so it emits **no** `ProjectEventKind` (the lifecycle events —
 * created/started/merged — stay meaningful); it is audit-logged.
 *
 * Only the fields you supply change — an omitted field is left untouched; a
 * `null` `description`/`doneWhen` clears it. At least one editable field must be
 * present (`nothing_to_update` otherwise).
 *
 * Authorization is the **owner** tier on the task's feature (`resolveFeatureAccess`
 * — the feature owner or a project lead): a non-member, or a task in a project the
 * caller can't see, is `not_found` (never `forbidden` — no enumeration); a member
 * who is neither owner nor lead is `forbidden`. Free text ⇒ `processesPii`.
 */

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { resolveFeatureAccess } from '@/lib/projects/access';
import { logAdminAction } from '@/lib/orchestration/audit/admin-audit-logger';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  taskId: z.string().describe('The task to edit.'),
  title: z.string().min(1).max(500).optional().describe('New title.'),
  description: z
    .string()
    .max(10000)
    .nullable()
    .optional()
    .describe('New full detail (markdown); null clears it.'),
  doneWhen: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe('New acceptance contract; null clears it.'),
  filesScope: z
    .array(z.string())
    .optional()
    .describe('New file-scope list — replaces the existing one.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  /** The names of the fields actually changed. */
  updated: string[];
}

export class UpdateTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'update_task';
  readonly processesPii = true; // free-text title / description / done-when

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'update_task',
    description:
      "Edit an existing task's fields: title, description (markdown), done-when (acceptance contract), and/or file scope. Only the fields you supply change; a null description/done-when clears it. Only the feature's owner or a project lead may edit its tasks. Does not change status.",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to edit.' },
        title: { type: 'string', description: 'New title.' },
        description: {
          type: 'string',
          description: 'New full detail (markdown); null clears it.',
        },
        doneWhen: { type: 'string', description: 'New acceptance contract; null clears it.' },
        filesScope: {
          type: 'array',
          items: { type: 'string' },
          description: 'New file-scope list — replaces the existing one.',
        },
      },
      required: ['taskId'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    // Mask the free-text edits on the durable provenance row; the id is not
    // sensitive. `undefined` (field untouched) is preserved as-is.
    const mask = (v: string | null | undefined, label: string) =>
      typeof v === 'string' ? redactedString(`${label} (${v.length} chars)`) : v;
    return {
      args: {
        taskId: args.taskId,
        title: mask(args.title, 'title'),
        description: mask(args.description, 'description'),
        doneWhen: mask(args.doneWhen, 'doneWhen'),
        filesScope: args.filesScope,
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('update_task requires a signed-in caller.', 'no_user_context');
    }

    // Build the patch from supplied fields only (undefined = leave unchanged; a
    // null description/doneWhen clears it). Scalar-list updates use `{ set }`.
    const data: Prisma.TaskUpdateInput = {};
    const updated: string[] = [];
    if (args.title !== undefined) {
      data.title = args.title;
      updated.push('title');
    }
    if (args.description !== undefined) {
      data.description = args.description;
      updated.push('description');
    }
    if (args.doneWhen !== undefined) {
      data.doneWhen = args.doneWhen;
      updated.push('doneWhen');
    }
    if (args.filesScope !== undefined) {
      data.filesScope = { set: args.filesScope };
      updated.push('filesScope');
    }
    if (updated.length === 0) {
      return this.error('No fields to update were provided.', 'nothing_to_update');
    }

    // Resolve the task's feature for the owner-tier funnel. A missing task is
    // not_found; the funnel then maps non-member → not_found, member-non-owner →
    // forbidden (no enumeration).
    const task = await prisma.task.findUnique({
      where: { id: args.taskId },
      select: { id: true, featureId: true },
    });
    if (!task) {
      return this.error(`Task ${args.taskId} not found.`, 'not_found');
    }
    const access = await resolveFeatureAccess(
      userId,
      task.featureId,
      'owner',
      context.scope?.projectId
    );
    if (!access.ok) {
      return access.reason === 'not_found'
        ? this.error(`Task ${args.taskId} not found.`, 'not_found')
        : this.error('Only the feature owner or a project lead can edit its tasks.', 'forbidden');
    }

    await prisma.task.update({ where: { id: task.id }, data });

    logAdminAction({
      userId,
      action: 'task.update',
      entityType: 'app_task',
      entityId: task.id,
      metadata: { fields: updated },
    });

    return this.success({ taskId: task.id, updated });
  }
}
