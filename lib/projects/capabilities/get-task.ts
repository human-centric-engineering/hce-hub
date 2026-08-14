/**
 * `get_task` — read one task's full detail over MCP (f-task-reads §30 t-68).
 *
 * The detail-read sibling of `list_tasks`, completing the discovery chain
 * `list_phases → list_tasks → get_task`. `list_tasks` *identifies* a task (title +
 * refs); `get_task` returns its **body** — description, done-when, dependency graph
 * with each neighbour's readiness — so a coding agent can actually work the task it
 * was handed by `t-N`, not just name it.
 *
 * A thin projection over `getTaskDetail` (`lib/projects/task-detail.ts`), the same
 * funnel-scoped read the web task-sheet renders: `getAccessibleProject` gates
 * visibility and the task is loaded **scoped to that project**, so a non-member,
 * an unknown task, or a task in another project is `not_found` (no id-swap, no
 * enumeration). `projectId` is optional — derived from the task via
 * `resolveTaskAccess` when omitted, the same ergonomics as `start_task` /
 * `complete_task`.
 *
 * The free-text body (title / description / done-when) is the task's authored
 * content, so `processesPii` is set and the provenance row masks it (the LLM still
 * sees it; the durable audit trail does not — the same stance as `create_task`).
 * The assignee is returned as a raw opaque id (like `list_tasks`), never a resolved
 * identity ⇒ no PII beyond the masked body.
 */
import { z } from 'zod';
import type { TaskKind } from '@prisma/client';
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
import { resolveTaskAccess } from '@/lib/projects/access';
import { getTaskDetail } from '@/lib/projects/task-detail';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  taskId: z.string().describe('The task to read.'),
  projectId: z
    .string()
    .optional()
    .describe('Optional: the task must belong to this project (guards an id mix-up).'),
});

type Args = z.infer<typeof schema>;

/** A dependency-graph neighbour (a blocker or a dependent). */
interface NeighbourRef {
  id: string;
  number: number | null;
  title: string;
  featureSlug: string | null;
  status: 'claimed' | 'active' | 'blocked' | 'merged';
}

interface Data {
  id: string;
  /** Project-wide `t-N`; `null` until assigned. */
  number: number | null;
  title: string;
  description: string | null;
  /** The acceptance contract (markdown); `null` until authored. */
  doneWhen: string | null;
  status: 'claimed' | 'active' | 'blocked' | 'merged';
  // `TaskKind` rather than a literal union: a hand-written copy silently goes
  // stale the next time the enum grows (it did, at §32 t-79's `enhancement`).
  kind: TaskKind;
  /** The phase that *chose* this work, when it differs from its feature's; `null` = inherit (§32 t-80). */
  phaseId: string | null;
  filesScope: string[];
  prUrl: string | null;
  /** Assignee (raw id; `null` when unassigned / erased). */
  assigneeUserId: string | null;
  feature: { id: string; slug: string | null; title: string };
  /** Tasks this one depends on — must be merged before it's pullable. */
  blockedBy: NeighbourRef[];
  /** Tasks that depend on this one — unblocked when it merges. */
  blocks: NeighbourRef[];
}

export class GetTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'get_task';
  readonly processesPii = true; // returns the free-text task body

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_task',
    description:
      "Read one task's full detail — its description, acceptance contract (done-when), effective status, kind, the phase that chose it (phaseId; null = inherits its feature's phase), file scope, PR url, feature (id + slug), and its dependency graph (blockedBy / blocks, each neighbour with its t-N + readiness). Use it after list_tasks to actually work a task you were handed by t-N — the detail list_tasks omits. Membership-scoped: a task you can't see (or in another project) is not_found.",
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task to read.' },
        projectId: {
          type: 'string',
          description: 'Optional: the task must belong to this project (guards an id mix-up).',
        },
      },
      required: ['taskId'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(args: Args, result: CapabilityResult<Data>): ProvenanceRedaction {
    // Keep the ids; mask the returned body — free-text task content must not land
    // verbatim in the durable audit trail (same stance as capture_idea / create_task).
    const n = result.data?.number ?? null;
    return {
      args: { taskId: args.taskId, projectId: args.projectId ?? null },
      resultPreview: redactedString(n !== null ? `task t-${n}` : 'task'),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('get_task requires a signed-in caller.', 'no_user_context');
    }

    try {
      // Resolve the project scope. When the caller passes projectId, use it (an
      // id-swap guard); otherwise derive it from the task through the same funnel.
      let projectId = args.projectId;
      if (!projectId) {
        const access = await resolveTaskAccess(userId, args.taskId);
        if (!access.ok) return this.error(`Task ${args.taskId} not found.`, 'not_found');
        projectId = access.task.projectId;
      }

      // Reuse the task-sheet's detail read (membership + project scope; throws
      // NotFoundError on deny / cross-project), then project down to the agent-facing shape.
      const d = await getTaskDetail(userId, projectId, args.taskId);
      return this.success({
        id: d.id,
        number: d.number,
        title: d.title,
        description: d.description,
        doneWhen: d.doneWhen,
        status: d.status,
        kind: d.kind,
        phaseId: d.phaseId,
        filesScope: d.filesScope,
        prUrl: d.prUrl,
        assigneeUserId: d.assignee?.id ?? null,
        feature: { id: d.feature.id, slug: d.feature.slug, title: d.feature.title },
        blockedBy: d.blockedBy.map((n) => ({
          id: n.id,
          number: n.number,
          title: n.title,
          featureSlug: n.featureSlug,
          status: n.status,
        })),
        blocks: d.blocks.map((n) => ({
          id: n.id,
          number: n.number,
          title: n.title,
          featureSlug: n.featureSlug,
          status: n.status,
        })),
      });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown / cross-project task.
      if (err instanceof NotFoundError) {
        return this.error(`Task ${args.taskId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
