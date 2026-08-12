/**
 * `get_project` — one project's meta + a structure roll-up over MCP
 * (f-mcp-project-scope §31 t-70). The companion to `list_projects`: once you have a
 * projectId, this is the project's own header — name, slug, status, host platform,
 * linked repo URLs, whether you lead it — plus counts (phases, features, tasks, open
 * ideas) so an agent can orient before drilling into `list_phases` / `get_feature`.
 *
 * `getAccessibleProject` is the access gate (deny ≡ not_found, no enumeration); the
 * counts are cheap aggregates scoped to the confirmed project. `projectId` is
 * fold-pinned for a project-scoped key (ambient) and required otherwise. A project
 * carries no personal data, so `processesPii` is false.
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { getAccessibleProject } from '@/lib/projects/access';
import { prisma } from '@/lib/db/client';

const schema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('The project to read. Ambient for a project-scoped key; required otherwise.'),
});

type Args = z.infer<typeof schema>;

interface Data {
  id: string;
  slug: string | null;
  name: string;
  status: string;
  /** The platform the project builds on (e.g. "sunrise"). */
  hostPlatform: string;
  repoUrls: string[];
  /** True when the caller is the project's lead. */
  isLead: boolean;
  /** Structure roll-up for orientation. */
  counts: { phases: number; features: number; tasks: number; openIdeas: number };
}

export class GetProjectCapability extends BaseCapability<Args, Data> {
  readonly slug = 'get_project';
  readonly processesPii = false; // project config, no personal data

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'get_project',
    description:
      "Read one project's header — id, slug, name, status, host platform, linked repo URLs, whether you're its lead — plus a structure roll-up (counts of phases, features, tasks, and open ideas). Use it after list_projects to orient before drilling into list_phases / get_feature. Membership-scoped: a project you can't see is not_found.",
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project to read. Ambient for a project-scoped key; required otherwise.',
        },
      },
      required: [],
    },
  };

  protected readonly schema = schema;

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('get_project requires a signed-in caller.', 'no_user_context');
    }
    if (!args.projectId) {
      return this.error(
        'get_project needs a projectId (it is ambient only for a project-scoped key).',
        'project_required'
      );
    }

    try {
      // Access gate (deny ≡ not_found). The returned row carries the header fields.
      const project = await getAccessibleProject(userId, args.projectId);
      const [phases, features, tasks, openIdeas] = await Promise.all([
        prisma.phase.count({ where: { projectId: project.id } }),
        prisma.feature.count({ where: { projectId: project.id } }),
        prisma.task.count({ where: { feature: { projectId: project.id } } }),
        prisma.idea.count({ where: { projectId: project.id, status: 'open' } }),
      ]);

      return this.success({
        id: project.id,
        slug: project.slug,
        name: project.name,
        status: project.status,
        hostPlatform: project.hostPlatform,
        repoUrls: project.repoUrls,
        isLead: project.leadUserId === userId,
        counts: { phases, features, tasks, openIdeas },
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return this.error(`Project ${args.projectId} not found.`, 'not_found');
      }
      throw err;
    }
  }
}
