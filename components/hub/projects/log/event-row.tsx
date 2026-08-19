'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Markdown } from '@/components/hub/markdown';
import { initials } from '@/components/hub/projects/presentation';
import { firstName } from '@/components/hub/projects/plan/presentation';
import { describeEvent, timeAgo } from '@/components/hub/projects/log/presentation';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

/** The actor's display name — a real member, an agent (§12), or an erased/system actor. */
function actorName(event: ProjectEventDTO): string {
  if (event.actor) return firstName(event.actor.name);
  if (event.actorAgentId) return 'An agent';
  return 'Someone';
}

/** Shared look for a ref chip, so the link and the button are indistinguishable. */
const refChip =
  'font-mono text-xs underline-offset-2 hover:underline focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none';

/**
 * One journal event, rendered identically in the project Log and the task-sheet
 * timeline. `showRefs` adds the feature/task chips (the Log needs them; the task
 * timeline is already in a task's context). Authored kinds (decision / note)
 * show their title + body; auto-events are just the actor + verb + time.
 *
 * **Bodies render as markdown** (§33-sweep t-85). `record_decision` / `add_note`
 * both document their body as markdown and the ones written during builds lean
 * on it hard — headings, bold, lists, code spans — so rendering the source was
 * wrong output, not a missing feature. Reuses the shared safe renderer
 * (`components/hub/markdown.tsx`, react-markdown with raw HTML escaped) rather
 * than introducing a second rendering path with its own escaping story.
 *
 * **Refs navigate** (t-105). A feature ref reaches its page and a `t-N` opens the
 * task sheet overlay in place, so reading the journal and then looking at what it
 * describes stops being a manual hunt. The task chip is a button, not a link:
 * the sheet is `?task=` History-API state the provider owns, and routing to it
 * would re-run the server render this surface exists to avoid.
 */
export function EventRow({
  event,
  projectRef,
  showRefs = false,
}: {
  event: ProjectEventDTO;
  /** The project's slug (or id) for the feature-page href — `slug ?? id`, per §19. */
  projectRef: string;
  showRefs?: boolean;
}) {
  const { open: openTask } = useTaskSheet();
  const authored = event.kind === 'decision' || event.kind === 'note';
  const feature = event.feature;
  const task = event.task;
  // A number-less task gets no chip: `t-—` reads as a broken ref, and the sheet
  // it would open is reachable from the surfaces that do know the task.
  const taskRef = task?.number != null ? task : null;

  return (
    <li className="flex gap-3 py-2.5">
      <Avatar className="mt-0.5 h-6 w-6 shrink-0">
        {event.actor?.image && <AvatarImage src={event.actor.image} alt="" />}
        <AvatarFallback className="text-[9px]">
          {event.actor ? initials(event.actor.name) : '·'}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] leading-snug" style={{ color: 'var(--ink-soft)' }}>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>
              {actorName(event)}
            </span>{' '}
            {describeEvent(event)}
            {showRefs && (feature || taskRef) && (
              <>
                {' '}
                {feature && (
                  <Link
                    href={`/projects/${projectRef}/features/${feature.slug ?? feature.id}`}
                    className={refChip}
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    {feature.slug ?? feature.title}
                  </Link>
                )}
                {feature && taskRef && (
                  <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {' · '}
                  </span>
                )}
                {taskRef && (
                  <button
                    type="button"
                    onClick={() => openTask(taskRef.id)}
                    className={refChip}
                    style={{ color: 'var(--ink-faint)' }}
                  >
                    t-{taskRef.number}
                  </button>
                )}
              </>
            )}
          </p>
          <time
            className="shrink-0 text-xs"
            style={{ color: 'var(--ink-faint)' }}
            dateTime={event.createdAt}
          >
            {timeAgo(event.createdAt)}
          </time>
        </div>

        {authored && event.title && (
          <p className="mt-0.5 text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
            {event.title}
          </p>
        )}
        {authored && event.body && (
          // Rendered in prose's own palette, NOT the row's `--ink-soft`. An
          // inherited container colour reaches the plain text but not `strong`,
          // `code`, links or headings — the typography plugin sets an explicit
          // `color` on each of those — so overriding it would render a decision
          // body in two inks. The feature page and task sheet already accept the
          // prose palette for the same authored content; the Log now matches.
          <Markdown
            content={event.body}
            className="mt-0.5 text-[13px] leading-relaxed break-words"
          />
        )}
      </div>
    </li>
  );
}
