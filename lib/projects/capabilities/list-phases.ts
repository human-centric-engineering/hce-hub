/**
 * `list_phases` — read a project's structure: its phases and the features filed
 * under each (f-idea-capture §22-03 t-57). The Hub's first **structure read** over
 * MCP: until now there was no way to discover a phase's id (to file a feature into
 * it) or a feature's id (to act on it) — inbox #10. Every write verb that takes a
 * `phaseId` / `featureId` (`update_feature`, `create_feature`'s new `phaseId`,
 * `capture_idea`) needs this to be usable by an agent at all.
 *
 * A thin read over `getProjectPlan` (which already assembles phases → features,
 * membership-scoped through the [[f-access]] funnel), projected down to the ids +
 * labels + status a caller needs to *find something to act on* — deliberately not
 * the Plan's full progress/deps payload. A non-member / unknown project is
 * `not_found` (no enumeration). Ids only in, ids + short labels out ⇒ no PII.
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { getProjectPlan } from '@/lib/projects/plan';
import type { PhaseStatus } from '@prisma/client';
import type { EffectiveFeatureStatus } from '@/lib/projects/feature-status';

const schema = z.object({
  projectId: z.string().describe('The project whose phases + features to read.'),
});

type Args = z.infer<typeof schema>;

/** A feature under a phase — just enough to identify and file/act on it. */
interface FeatureRef {
  id: string;
  /** Project-wide `§N`; `null` until assigned. */
  number: number | null;
  /** Authored short key (`f-mcp`); `null` until authored. */
  slug: string | null;
  title: string;
  /** Readiness-derived status (`available` | `blocked` | `in_flight` | `shipped`). */
  status: EffectiveFeatureStatus;
}

/** A phase band — a real phase, or the residual `id: null` "no phase" bucket. */
interface PhaseRef {
  id: string | null;
  name: string | null;
  status: PhaseStatus | null;
  ordinal: number | null;
  features: FeatureRef[];
}

interface Data {
  projectId: string;
  phases: PhaseRef[];
}

export class ListPhasesCapability extends BaseCapability<Args, Data> {
  readonly slug = 'list_phases';
  readonly processesPii = false; // ids + short labels only

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'list_phases',
    description:
      "Read a project's structure — its phases (with ids, names, status) and the features filed under each (with ids, slugs, numbers, status), plus a residual bucket (phase id null) for features not filed under any phase. Use it to discover the phase id to file a feature into, or a feature's id to act on. Membership-scoped: a project you can't see is not_found.",
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project whose phases + features to read.' },
      },
      required: ['projectId'],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('list_phases requires a signed-in caller.', 'no_user_context');
    }

    try {
      // Reuse the Plan read (membership-scoped; throws NotFoundError on deny), then
      // project down to the ids + labels a caller needs to find something to act on.
      const plan = await getProjectPlan(userId, args.projectId);
      return this.success({
        projectId: args.projectId,
        phases: plan.phases.map((band) => ({
          id: band.id,
          name: band.name,
          status: band.status,
          ordinal: band.ordinal,
          features: band.features.map((f) => ({
            id: f.id,
            number: f.number,
            slug: f.slug,
            title: f.title,
            status: f.status,
          })),
        })),
      });
    } catch (err) {
      // Funnel 404 for a non-member caller / unknown project (no enumeration).
      if (err instanceof NotFoundError) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
