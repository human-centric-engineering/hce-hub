/**
 * `get_feature` — read one feature's spec over MCP (f-mcp-project-scope §31 t-70).
 *
 * The middle of the read chain `list_projects → list_phases → get_feature →
 * list_tasks`: `list_phases` names a feature (id + slug + status); `get_feature`
 * returns the **spec an agent needs to work it** — description, done-when,
 * effective status, planning stage, dependency graph, and a task summary. This is
 * the read whose absence blocked planning f-github-identity over MCP.
 *
 * A thin projection over `getFeatureDetail` (`lib/projects/feature-detail.ts`),
 * the same funnel-scoped read the web feature page renders: `getAccessibleProject`
 * gates visibility, and the feature is matched **within the resolved project**, so
 * a non-member, an unknown feature, or one in another project is `not_found` (no
 * id-swap, no enumeration). `featureRef` is the feature's slug (`f-mcp`) or id;
 * `projectId` is fold-pinned for a project-scoped key (ambient) and required for
 * an unscoped one — the same scope ergonomics as the other reads.
 *
 * The free-text spec (title / description / done-when) is authored content, so
 * `processesPii` is set and the provenance row masks it. People are returned as
 * raw ids (owner), never resolved identities ⇒ no PII beyond the masked body.
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
import { getFeatureDetail } from '@/lib/projects/feature-detail';
import { computeFeatureProgress } from '@/lib/projects/feature-progress';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  featureRef: z.string().describe("The feature to read — its slug (e.g. 'f-mcp') or id."),
  projectId: z
    .string()
    .optional()
    .describe(
      'The project the feature belongs to. Ambient for a project-scoped key; required otherwise.'
    ),
});

type Args = z.infer<typeof schema>;

/** A depended-on feature (the dependency edge carries the neighbour's id). */
interface FeatureNeighbour {
  id: string;
  slug: string | null;
  title: string;
}

/** A blocking dependency in the `waitingOn` list (slug + title only). */
interface WaitingNeighbour {
  slug: string | null;
  title: string;
}

interface Data {
  id: string;
  /** Project-wide `§N`; `null` until assigned. */
  number: number | null;
  slug: string | null;
  title: string;
  description: string | null;
  /** The feature's definition of done (markdown); `null` until authored. */
  doneWhen: string | null;
  /** Readiness-derived status (available | in_flight | blocked | shipped). */
  status: string;
  /** Depth axis: `indicative` sketch vs `planned` (real tasks materialised). */
  planningStage: string;
  helpWanted: boolean;
  /** Owner (raw id; `null` when unowned / erased). */
  ownerUserId: string | null;
  /** The phase this feature is filed under; `null` when unfiled (§32 t-80). */
  phase: { id: string; name: string } | null;
  /** Features this one depends on. */
  dependsOn: FeatureNeighbour[];
  /** For a `blocked` feature: the unshipped dependencies it waits on. */
  waitingOn: WaitingNeighbour[];
  /**
   * Task roll-up (once planned) — the SAME numbers the Plan renders, via
   * `computeFeatureProgress` (§32 t-80). Bugs are off the completion axis and
   * tallied as `openFixes`; past the feature's ship boundary nothing counts
   * toward completion whatever its kind, so `total`/`merged` are settled history.
   * `live` and `blocked` are current activity and deliberately span post-ship
   * work — dropping `blocked` would hide a dependency-blocked post-ship task
   * entirely (off `total`, not `active`, not a `bug`), so an agent would read
   * "nothing outstanding" while the Plan renders a blocked row.
   *
   * Counting raw rows here used to make the agent and the human disagree about
   * whether a feature was done (§21 read 7/7 over MCP vs 5/5 on the Plan).
   */
  tasks: {
    total: number;
    merged: number;
    live: number;
    blocked: number;
    openFixes: number;
    openSinceShip: number;
  };
  /** The high-level sketch (while indicative; replaced at plan time). */
  indicativeTasks: { order: number; text: string }[];
}

export class GetFeatureCapability extends BaseCapability<Args, Data> {
  readonly slug = 'get_feature';
  readonly processesPii = true; // returns the free-text feature spec

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_feature',
    description:
      "Read one feature's spec — its description, definition of done, effective status, planning stage (indicative sketch vs planned), the phase it is filed under, dependency graph (dependsOn / waitingOn), a task roll-up (total/merged count completion only: bugs and work raised after the feature shipped are excluded, and surface as live/blocked/openFixes/openSinceShip instead — the same numbers the Plan shows, and every open task appears in exactly one of them), and any indicative-task sketch. Use it after list_phases to understand a feature before working it. featureRef is the feature's slug (e.g. 'f-mcp') or id. Membership-scoped: a feature you can't see (or in another project) is not_found.",
    parameters: {
      type: 'object',
      properties: {
        featureRef: {
          type: 'string',
          description: "The feature to read — its slug (e.g. 'f-mcp') or id.",
        },
        projectId: {
          type: 'string',
          description:
            'The project the feature belongs to. Ambient for a project-scoped key; required otherwise.',
        },
      },
      required: ['featureRef'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(args: Args, result: CapabilityResult<Data>): ProvenanceRedaction {
    // Keep the refs; mask the returned spec — free-text feature content must not
    // land verbatim in the durable audit trail (same stance as get_task).
    const n = result.data?.number ?? null;
    return {
      args: { featureRef: args.featureRef, projectId: args.projectId ?? null },
      resultPreview: redactedString(n !== null ? `feature §${n}` : 'feature'),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('get_feature requires a signed-in caller.', 'no_user_context');
    }
    if (!args.projectId) {
      // Unlike task reads, a feature is resolved by (project, ref) — there is no
      // global feature lookup — so the project is required when it isn't ambient.
      return this.error(
        'get_feature needs a projectId (it is ambient only for a project-scoped key).',
        'project_required'
      );
    }

    try {
      // Reuse the web feature page's detail read (membership + project scope;
      // throws NotFoundError on deny / cross-project), then project to the
      // agent-facing spec shape.
      const d = await getFeatureDetail(userId, args.projectId, args.featureRef);
      // One shared computation with the Plan — never a second hand-rolled count.
      const progress = computeFeatureProgress(d.tasks, d.shippedAt);
      return this.success({
        id: d.id,
        number: d.number,
        slug: d.slug,
        title: d.title,
        description: d.description,
        doneWhen: d.doneWhen,
        status: d.status,
        planningStage: d.planningStage,
        helpWanted: d.helpWanted,
        ownerUserId: d.owner?.id ?? null,
        phase: d.phase,
        dependsOn: d.dependsOn.map((n) => ({ id: n.id, slug: n.slug, title: n.title })),
        waitingOn: d.waitingOn.map((n) => ({ slug: n.slug, title: n.title })),
        tasks: {
          total: progress.total,
          merged: progress.merged,
          live: progress.live,
          blocked: progress.blocked,
          openFixes: progress.openFixes,
          openSinceShip: progress.openSinceShip,
        },
        indicativeTasks: d.indicativeTasks.map((t) => ({ order: t.order, text: t.text })),
      });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown / cross-project feature.
      if (err instanceof NotFoundError) {
        return this.error(`Feature ${args.featureRef} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
