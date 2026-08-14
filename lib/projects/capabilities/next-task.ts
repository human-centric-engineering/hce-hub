/**
 * `next_task` — recommend the caller's highest-priority task to start next.
 *
 * The flagship Hub read capability (v1-requirements §11, §5). Returns the single
 * best task the caller can start right now: a `claimed` task whose every
 * dependency is merged (never one blocked by an unmerged PR — that's the derived
 * `blocked`). Everything is membership-scoped through the f-access funnel: a
 * caller only ever sees tasks in projects they're a member of.
 *
 * **The pool is your work plus the commons** (§32 t-90). "Your work" is a feature
 * you own or any task held by you; the "commons" is the unclaimed pool t-89 made
 * real, plus help-wanted features when asked. Before t-90 only owned features were
 * considered, so an unassigned task on someone else's feature — visible to a human
 * in the Board's Unassigned lane and pullable by anyone — was invisible to the
 * agent. That is precisely the human-view / MCP-view divergence the Hub exists to
 * prevent: two surfaces answering "what next?" differently.
 *
 * Which tier you are handed is `pickFocusedTask`'s call, not this module's — see
 * `next-task-pick.ts` for the policy and why it is a default rather than a rule.
 *
 * It is a *recommendation*, never enforcement — the caller may work any task
 * they can see; this just answers "what would I pick up next?" (§3.5,
 * exploratory ordering). v1 priority heuristic: oldest-ready-first (by feature
 * then task creation), deterministic and advisory.
 *
 * Readiness (effective `claimed` — deps all merged) is computed by the shared
 * `computeEffectiveStatus` so this and `f-board-view` never diverge.
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
import { canAccessProject, accessibleProjectIds } from '@/lib/projects/access';
import { computeEffectiveStatus } from '@/lib/projects/task-status';
import { pickFocusedTask } from '@/lib/projects/next-task-pick';

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
  /** Project-wide `t-N` ref (f-refs; `null` until assigned) — name the pick without a second read (t-66). */
  number: number | null;
  title: string;
  featureId: string;
  /** The feature's authored slug (`f-mcp`); `null` until authored. */
  featureSlug: string | null;
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
      "Recommend the single highest-priority task the caller can start next — a claimed task whose dependencies are all merged (nothing blocked by an open PR). Considers both the caller's own work (a feature they own, or any task assigned to or held by them) and the unclaimed pool any member may pull from; own work is offered first, and the caller is only pointed at the pool when none of their own is ready. Membership-scoped: only the caller's projects are considered. A recommendation, not an assignment. The result includes the task t-N + feature slug so you can name it.",
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Optional: restrict to one project the caller is a member of.',
        },
        includeHelpWanted: {
          type: 'boolean',
          description:
            'Optional: also consider tasks on help-wanted features, alongside the unclaimed pool.',
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

    // Candidate tasks, within the resolved project scope, oldest-ready-first. Two
    // axes, deliberately (§32 t-90): **your work** is a fact about ownership, and
    // the **commons** is a fact about a task being held by nobody — the state t-89
    // made real. A task can satisfy both (an unassigned task on a feature you own);
    // which tier it lands in is decided below, not here.
    const inScope = { projectId: projectScope };
    const commons: Prisma.TaskWhereInput[] = [
      // The unclaimed pool: nobody assigned, nobody holding.
      { assigneeUserId: null, claimedByUserId: null, feature: inScope },
    ];
    if (args.includeHelpWanted) {
      // Opted-in commons — "the owner can't get to this". Kept assignment-blind so
      // this stays a widening: a help-wanted task that *is* assigned still counts,
      // exactly as it did before the pool existed.
      commons.push({ feature: { ...inScope, helpWanted: true } });
    }

    const candidates = await prisma.task.findMany({
      where: {
        OR: [
          { feature: { ...inScope, ownerUserId: userId } }, // a feature you own
          { assigneeUserId: userId, feature: inScope }, // assigned to you anywhere
          { claimedByUserId: userId, feature: inScope }, // or held by you anywhere
          ...commons,
        ],
      },
      select: {
        id: true,
        number: true,
        title: true,
        featureId: true,
        filesScope: true,
        prUrl: true,
        status: true,
        kind: true,
        claimedByUserId: true,
        assigneeUserId: true,
        feature: { select: { projectId: true, slug: true, ownerUserId: true } },
        dependencies: { select: { dependsOn: { select: { status: true } } } },
      },
      orderBy: [{ feature: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    });

    // Pullable = every dependency merged (effective `claimed`), in oldest-ready
    // order. Among them the focus policy picks: own work before the commons, with
    // the f-bug-handling §22-02 bug bias applying within the chosen tier (a bug
    // floats above feature-work of equal readiness, never overriding deps).
    const pullable = candidates.filter(
      (t) =>
        computeEffectiveStatus(
          t,
          t.dependencies.map((d) => d.dependsOn)
        ) === 'claimed'
    );
    const pick = pickFocusedTask(
      pullable,
      (t) =>
        t.feature.ownerUserId === userId ||
        t.assigneeUserId === userId ||
        t.claimedByUserId === userId
    );

    return this.success({
      task: pick
        ? {
            id: pick.id,
            number: pick.number,
            title: pick.title,
            featureId: pick.featureId,
            featureSlug: pick.feature.slug,
            projectId: pick.feature.projectId,
            filesScope: pick.filesScope,
            prUrl: pick.prUrl,
          }
        : null,
      consideredCount: candidates.length,
    });
  }
}
