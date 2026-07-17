import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/components/hub/projects/presentation';
import { firstName } from '@/components/hub/projects/plan/presentation';
import { describeEvent, timeAgo } from '@/components/hub/projects/log/presentation';
import type { ProjectEventDTO } from '@/components/hub/projects/log/types';

/** The actor's display name — a real member, an agent (§12), or an erased/system actor. */
function actorName(event: ProjectEventDTO): string {
  if (event.actor) return firstName(event.actor.name);
  if (event.actorAgentId) return 'An agent';
  return 'Someone';
}

/**
 * One journal event, rendered identically in the project Log and the task-sheet
 * timeline. `showRefs` adds the feature/task chips (the Log needs them; the task
 * timeline is already in a task's context). Authored kinds (decision / note)
 * show their title + body; auto-events are just the actor + verb + time.
 */
export function EventRow({
  event,
  showRefs = false,
}: {
  event: ProjectEventDTO;
  showRefs?: boolean;
}) {
  const authored = event.kind === 'decision' || event.kind === 'note';
  const taskRef = event.task?.number != null ? `t-${event.task.number}` : null;
  const featureRef = event.feature ? (event.feature.slug ?? event.feature.title) : null;

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
            {showRefs && (featureRef || taskRef) && (
              <>
                {' '}
                <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
                  {[featureRef, taskRef].filter(Boolean).join(' · ')}
                </span>
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
          <p
            className="mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--ink-soft)' }}
          >
            {event.body}
          </p>
        )}
      </div>
    </li>
  );
}
