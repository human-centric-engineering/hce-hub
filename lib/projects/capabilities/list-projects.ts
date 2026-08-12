/**
 * `list_projects` — the caller's accessible projects over MCP (f-mcp-project-scope
 * §31 t-70). The **entry point** of the read chain: everything else needs a
 * `projectId`, and this is how an agent discovers one.
 *
 * Scope-aware, matching the feature's isolation model:
 * - A **project-scoped key** (`context.scope.projectId` set) sees **only its own
 *   project** — the agent's world is exactly the repo it's connected to. The lookup
 *   still goes through the membership funnel (`getAccessibleProject`), so a stale
 *   scope resolves to `not_found` like any other verb.
 * - An **unscoped key** (the cross-project "super-admin" key, or the human web
 *   session) lists **every project the caller is a member of** — the "which
 *   projects can I connect to?" view.
 *
 * A project carries no personal data (name / slug / status / repoUrls are config;
 * `isLead` is derived from the opaque `leadUserId`), so `processesPii` is false.
 */
import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { NotFoundError } from '@/lib/api/errors';
import { getAccessibleProject, listAccessibleProjects } from '@/lib/projects/access';

const schema = z.object({});

type Args = z.infer<typeof schema>;

/** A project the caller can reach, projected to the fields an agent needs to pick one. */
interface ProjectRef {
  id: string;
  slug: string | null;
  name: string;
  status: string;
  /** The platform the project builds on (e.g. "sunrise"). */
  hostPlatform: string;
  /** Git remotes linked to the project (for the repo↔project match). */
  repoUrls: string[];
  /** True when the caller is the project's lead. */
  isLead: boolean;
}

interface Data {
  projects: ProjectRef[];
}

export class ListProjectsCapability extends BaseCapability<Args, Data> {
  readonly slug = 'list_projects';
  readonly processesPii = false; // project config, no personal data

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'list_projects',
    description:
      "List the projects you can access — each with its id, slug, name, status, host platform, linked repo URLs, and whether you're its lead. The entry point of the read chain: use it to find a projectId, then list_phases / get_feature / list_tasks. A project-scoped key sees only its own project; an unscoped key sees every project you're a member of.",
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  };

  protected readonly schema = schema;

  async execute(_args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('list_projects requires a signed-in caller.', 'no_user_context');
    }

    // A scoped key's world is exactly one project. Resolve it through the same
    // membership funnel every verb uses (deny ≡ not_found), so a stale scope is
    // surfaced consistently rather than silently returning an empty list.
    const scopedProjectId = context.scope?.projectId;
    let projects;
    if (scopedProjectId) {
      try {
        projects = [await getAccessibleProject(userId, scopedProjectId)];
      } catch (err) {
        if (err instanceof NotFoundError) return this.success({ projects: [] });
        throw err;
      }
    } else {
      projects = await listAccessibleProjects(userId);
    }

    return this.success({
      projects: projects.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        status: p.status,
        hostPlatform: p.hostPlatform,
        repoUrls: p.repoUrls,
        isLead: p.leadUserId === userId,
      })),
    });
  }
}
