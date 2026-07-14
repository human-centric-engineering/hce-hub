/**
 * `add_backlog` — drop a thought against a feature without context-switching
 * (v1-requirements §11). Creates a `backlog` task: captured, but not yet
 * promoted to the pullable pool (`create_task` / the board promotes it later).
 *
 * Authorization is the `member` tier — any project member may add to the
 * backlog (capturing an idea is collaborative), unlike `create_task`'s
 * owner-scoped promotion. Routed through `resolveFeatureAccess`, so a
 * non-member sees `not_found` (no enumeration).
 */

import { z } from 'zod';
import type { TaskStatus } from '@prisma/client';
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
  featureId: z.string().describe('The feature to add the backlog item to.'),
  title: z.string().min(1).max(500).describe('Short description of the backlog item.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  taskId: string;
  status: TaskStatus;
  featureId: string;
}

export class AddBacklogCapability extends BaseCapability<Args, Data> {
  readonly slug = 'add_backlog';
  readonly processesPii = true; // carries a free-text title

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'add_backlog',
    description:
      'Capture a thought as a backlog item against a feature, without switching context. Creates a task in the backlog (not yet available to pull). Any project member may add to the backlog.',
    parameters: {
      type: 'object',
      properties: {
        featureId: { type: 'string', description: 'The feature to add the backlog item to.' },
        title: { type: 'string', description: 'Short description of the backlog item.' },
      },
      required: ['featureId', 'title'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(
    args: Args,
    result: CapabilityResult<Data>
  ): { args: unknown; resultPreview: string } {
    return {
      args: {
        featureId: args.featureId,
        title: redactedString(`title (${args.title.length} chars)`),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('add_backlog requires a signed-in caller.', 'no_user_context');
    }

    const access = await resolveFeatureAccess(userId, args.featureId, 'member');
    if (!access.ok) {
      // 'member' mode never returns 'forbidden' (any member passes); a denial is
      // always a non-member → not_found. Handle both defensively regardless.
      return this.error(`Feature ${args.featureId} not found.`, 'not_found');
    }

    const task = await prisma.task.create({
      data: { featureId: args.featureId, title: args.title, status: 'backlog' },
      select: { id: true, status: true },
    });

    logAdminAction({
      userId,
      action: 'task.add_backlog',
      entityType: 'app_task',
      entityId: task.id,
      entityName: args.title,
      metadata: { featureId: args.featureId },
    });

    return this.success({ taskId: task.id, status: task.status, featureId: args.featureId });
  }
}
