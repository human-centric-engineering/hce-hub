/**
 * `list_ideas` — read a project's idea inbox over MCP (f-idea-capture §22 t-63).
 *
 * The read that makes promotion usable from Claude Code: the inbox web UI shows
 * ideas by their `#N` handle, but until now an agent had **no way to see them** —
 * so "promote #4" couldn't be resolved to an idea id. This lists the actionable
 * ideas (`open` to triage, `dropped` the reversible archive; `promoted` excluded)
 * with their number, id, status, and text, so a caller can find the right one and
 * pass its id as `fromIdeaId` to `create_feature` / `create_task` / `create_phase`.
 *
 * A thin projection over `getProjectIdeas` (the same funnel-scoped read the inbox
 * GET serves), narrowed to the fields a caller needs to identify an idea to act on.
 * A non-member / unknown project is `not_found` (no enumeration). The idea `text`
 * is the subject's free-text personal data, so `processesPii` is set and the
 * provenance row masks the returned texts (the LLM still sees them; the audit
 * trail does not — the same stance as `capture_idea`).
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
import { getProjectIdeas } from '@/lib/projects/ideas';
import { redactedString } from '@/lib/security/redact';

const schema = z.object({
  projectId: z.string().describe('The project whose idea inbox to read.'),
});

type Args = z.infer<typeof schema>;

/** An inbox idea — just enough to identify one to triage / promote. */
interface IdeaRef {
  /** Stable project-wide `#N` handle; `null` only for a pre-t-63 backfilled row. */
  number: number | null;
  id: string;
  /** `open` (to triage) or `dropped` (archived, restorable). */
  status: 'open' | 'dropped';
  text: string;
}

interface Data {
  projectId: string;
  ideas: IdeaRef[];
}

export class ListIdeasCapability extends BaseCapability<Args, Data> {
  readonly slug = 'list_ideas';
  readonly processesPii = true; // returns free-text idea jots

  readonly functionDefinition: CapabilityFunctionDefinition = {
    name: 'list_ideas',
    description:
      'Read a project\'s idea inbox — the actionable ideas (open, to triage; and dropped, the reversible archive) with their #N handle, id, status, and text. Promoted ideas are excluded. Use it to find the idea a human means by "promote #4", then pass its id as fromIdeaId to create_feature / create_task / create_phase. Membership-scoped: a project you can\'t see is not_found.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project whose idea inbox to read.' },
      },
      required: ['projectId'],
    },
  };

  protected readonly schema = schema;

  redactProvenance(args: Args, result: CapabilityResult<Data>): ProvenanceRedaction {
    // Keep the scope id; mask the returned jots — free-text personal data must not
    // land verbatim in the durable audit trail (same stance as capture_idea).
    const count = result.data?.ideas.length ?? 0;
    return {
      args: { projectId: args.projectId },
      resultPreview: redactedString(`${count} idea(s)`),
    };
  }

  async execute(args: Args, context: CapabilityContext): Promise<CapabilityResult<Data>> {
    const { userId } = context;
    if (!userId) {
      return this.error('list_ideas requires a signed-in caller.', 'no_user_context');
    }

    try {
      // Reuse the inbox read (membership-scoped; throws NotFoundError on deny),
      // then project down to the fields a caller needs to identify an idea.
      const { ideas } = await getProjectIdeas(userId, args.projectId);
      return this.success({
        projectId: args.projectId,
        ideas: ideas.map((i) => ({
          number: i.number,
          id: i.id,
          status: i.status,
          text: i.text,
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
