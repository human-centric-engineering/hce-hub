/**
 * `next_task` — recommend the caller's highest-priority pullable task.
 *
 * The flagship Hub read capability (v1-requirements §11, §5). Returns the single
 * best task the caller can pull right now: a genuinely **pullable** task (every
 * dependency merged — never one blocked by an unmerged PR) in a feature the
 * caller **owns**, or — when `includeHelpWanted` is set — any `help-wanted`
 * feature. Everything is membership-scoped through the f-access funnel: a caller
 * only ever sees tasks in projects they're a member of.
 *
 * It is a *recommendation*, never enforcement — the caller may pull any task
 * they can see; this just answers "what would I pick up next?" (§3.5,
 * exploratory ordering). v1 priority heuristic: oldest-ready-first (by feature
 * then task creation), deterministic and advisory.
 *
 * Pullability (incl. the null-claimant handling) is computed by the shared
 * `computeEffectiveStatus` so this and `f-board-view` never diverge.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { prisma } from '@/lib/db/client';
import { canAccessProject, accessibleProjectIds } from '@/lib/projects/access';
import { computeEffectiveStatus } from '@/lib/projects/task-status';

const schema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('Restrict the recommendation to one project the caller is a member of.'),
  includeHelpWanted: z
    .boolean()
    .optional()
    .describe("Also consider tasks in help-wanted features, not just the caller's own."),
});

type Args = z.infer<typeof schema>;

/** The recommended task, shaped for a caller to act on. `null` when none. */
interface NextTaskDto {
  id: string;
  title: string;
  featureId: string;
  projectId: string;
  filesScope: string[];
  prUrl: string | null;
}

interface Data {
  task: NextTaskDto | null;
  /** How many candidate tasks were considered (before the pullable filter). */
  consideredCount: number;
}

export class NextTaskCapability extends BaseCapability<Args, Data> {
  readonly slug = 'next_task';
  readonly processesPii = false;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'next_task',
    description:
      "Recommend the single highest-priority task the caller can pull right now — a task whose dependencies are all merged (nothing blocked by an open PR), in a feature the caller owns, or any help-wanted feature when includeHelpWanted is true. Membership-scoped: only the caller's projects are considered. A recommendation, not an assignment.",
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional: restrict to one project the caller is a member of.',
        },
        includeHelpWanted: {
          type: 'boolean',
          description: "Optional: also consider help-wanted features, not just the caller's own.",
        },
      },
      required: [],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error(
        'next_task needs a signed-in caller and is unavailable for system-initiated runs.',
        'no_user_context'
      );
    }

    // Resolve the project scope through the f-access funnel. An explicit
    // projectId must be one the caller can access (deny ≡ 404, no enumeration);
    // otherwise scope to every project they're a member of.
    let projectScope: { in: string[] } | string;
    if (args.projectId) {
      const { ok, basis } = await canAccessProject(userId, args.projectId);
      if (basis === null) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      if (!ok) return this.error('You do not have access to that project.', 'forbidden');
      projectScope = args.projectId;
    } else {
      const ids = await accessibleProjectIds(userId);
      if (ids.length === 0) return this.success({ task: null, consideredCount: 0 });
      projectScope = { in: ids };
    }

    // Candidate tasks: in the caller's owned features (plus help-wanted when
    // asked), within the resolved project scope, oldest-ready-first.
    const featureWhere = args.includeHelpWanted
      ? { projectId: projectScope, OR: [{ ownerUserId: userId }, { helpWanted: true }] }
      : { projectId: projectScope, ownerUserId: userId };

    const candidates = await prisma.task.findMany({
      where: { feature: featureWhere },
      select: {
        id: true,
        title: true,
        featureId: true,
        filesScope: true,
        prUrl: true,
        status: true,
        claimedByUserId: true,
        feature: { select: { projectId: true } },
        dependencies: { select: { dependsOn: { select: { status: true } } } },
      },
      orderBy: [{ feature: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    });

    const pick = candidates.find(
      (t) =>
        computeEffectiveStatus(
          t,
          t.dependencies.map((d) => d.dependsOn)
        ) === 'available'
    );

    return this.success({
      task: pick
        ? {
            id: pick.id,
            title: pick.title,
            featureId: pick.featureId,
            projectId: pick.feature.projectId,
            filesScope: pick.filesScope,
            prUrl: pick.prUrl,
          }
        : null,
      consideredCount: candidates.length,
    });
  }
}
