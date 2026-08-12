/**
 * `list_events` — read a project's journal over MCP (f-mcp-project-scope §31 t-70).
 * Closes the write-but-can't-read gap: `record_decision` / `add_note` write to the
 * `ProjectEvent` stream, and every lifecycle action (claim / plan / ship / merge)
 * appends to it — but until now an agent could not read it back. This is the read
 * for "what happened here", "this feature's activity", or "this task's timeline".
 *
 * A thin projection over `getProjectEvents` (`lib/projects/journal.ts`), the same
 * funnel-scoped read the web journal renders (`getAccessibleProject` gates
 * visibility, deny ≡ not_found; capped newest-first). Optional `featureId` / `taskId`
 * scope it to one feature or task. `projectId` is fold-pinned for a project-scoped
 * key (ambient) and required otherwise.
 *
 * Events carry authored free-text (decision / note `title` + `body`) and a human
 * actor, so `processesPii` is set: the actor is returned as a raw id (never a
 * resolved identity), and the provenance row masks the bodies.
 */
import { z } from 'zod';
import {
  BaseCapability,
  type ProvenanceRedaction,
} from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { getProjectEvents } from '@/lib/projects/journal';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(
      'The project whose journal to read. Ambient for a project-scoped key; required otherwise.'
    ),
  featureId: z.string().optional().describe('Optional: scope to one feature’s events.'),
  taskId: z.string().optional().describe('Optional: scope to one task’s timeline.'),
});

type Args = z.infer<typeof schema>;

interface EventRef {
  id: string;
  kind: string;
  /** The human actor (raw id), or `null` (agent / system / erased). */
  actorUserId: string | null;
  /** A Sunrise AiAgent id when agent-authored; else `null`. */
  actorAgentId: string | null;
  feature: { id: string; slug: string | null; title: string } | null;
  task: { id: string; number: number | null } | null;
  /** Authored-kind heading (decision / note); `null` for auto-events. */
  title: string | null;
  /** Authored-kind markdown body; `null` for auto-events. */
  body: string | null;
  metadata: unknown;
  /** ISO timestamp. */
  createdAt: string;
}

interface Data {
  events: EventRef[];
}

export class ListEventsCapability extends BaseCapability<Args, Data> {
  readonly slug = 'list_events';
  readonly processesPii = true; // authored free-text bodies + human actors

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'list_events',
    description:
      "Read a project's journal (newest first, capped) — decisions, notes, and lifecycle events (claim / plan / ship / merge), each with its kind, actor, feature/task ref, authored title + body, and timestamp. Use it to catch up on what happened, or scope with featureId / taskId for one feature's activity or a task's timeline. Membership-scoped: a project you can't see is not_found.",
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description:
            'The project whose journal to read. Ambient for a project-scoped key; required otherwise.',
        },
        featureId: { type: 'string', description: 'Optional: scope to one feature’s events.' },
        taskId: { type: 'string', description: 'Optional: scope to one task’s timeline.' },
      },
      required: [],
    },
  };

  protected readonly schema = schema;

  redactProvenance(args: Args, result: CapabilityResult<Data>): ProvenanceRedaction {
    // Keep the scope ids; mask the authored bodies — free-text journal content must
    // not land verbatim in the durable audit trail (same stance as record_decision).
    const count = result.data?.events.length ?? 0;
    return {
      args: {
        projectId: args.projectId ?? null,
        featureId: args.featureId ?? null,
        taskId: args.taskId ?? null,
      },
      resultPreview: redactedString(`${count} event(s)`),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('list_events requires a signed-in caller.', 'no_user_context');
    }
    if (!args.projectId) {
      return this.error(
        'list_events needs a projectId (it is ambient only for a project-scoped key).',
        'project_required'
      );
    }

    try {
      const events = await getProjectEvents(userId, args.projectId, {
        ...(args.featureId ? { featureId: args.featureId } : {}),
        ...(args.taskId ? { taskId: args.taskId } : {}),
      });
      return this.success({
        events: events.map((e) => ({
          id: e.id,
          kind: e.kind,
          actorUserId: e.actor?.id ?? null,
          actorAgentId: e.actorAgentId,
          feature: e.feature,
          task: e.task,
          title: e.title,
          body: e.body,
          metadata: e.metadata,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown project.
      if (err instanceof NotFoundError) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
