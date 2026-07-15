/**
 * A task card on the Board (f-board-view t-2).
 *
 * Title · feature ref (the feature's title — no slug in the schema) · meta
 * (claimer avatar, soft-collision marker, PR link). `is-mine` gets a clay left
 * border; a collision gets an ambient bottom tint + a pulsing marker (§5/§13.5 —
 * a signal, never a lock). Filenames are intentionally off the card. Display-only
 * in §10 — clicking opens the task sheet in `f-task-sheet` §11 (not wired here).
 */
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { sanitizeUrl } from '@/lib/security/sanitize';
import { firstName, prLabel } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import type { BoardTaskCard } from '@/components/hub/projects/board/types';

/** A quiet, slowly-pulsing collision marker. */
function CollisionMark({ note }: { note: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9.5px] tracking-wide"
      style={{ color: 'var(--accent-ink)' }}
      title={note}
    >
      <span
        className="relative inline-block h-[5px] w-[5px] rounded-full"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        <span
          aria-hidden
          className="absolute -inset-0.5 animate-ping rounded-full opacity-40"
          style={{ backgroundColor: 'var(--accent)' }}
        />
      </span>
      collision
    </span>
  );
}

export function TaskCard({ card }: { card: BoardTaskCard }) {
  const prUrl = card.prUrl ? sanitizeUrl(card.prUrl) : '';

  return (
    <div
      className={cn(
        'bg-card flex max-w-full min-w-0 flex-col gap-1.5 rounded-lg border p-2.5 text-[13px] transition-shadow hover:shadow-sm',
        card.isMine && 'border-l-2'
      )}
      style={{
        ...(card.isMine ? { borderLeftColor: 'var(--accent)' } : {}),
        ...(card.collision
          ? { background: 'linear-gradient(180deg, var(--bg-elev) 90%, var(--accent-bg) 100%)' }
          : {}),
      }}
    >
      <span className="leading-snug">{card.title}</span>
      <span
        className="truncate font-mono text-[11px]"
        style={{ color: 'var(--ink-faint)' }}
        title={card.featureTitle}
      >
        {card.featureTitle}
      </span>
      {(card.claimer || card.collision || prUrl) && (
        <div className="flex flex-wrap items-center gap-2">
          {card.claimer && (
            <span className="flex items-center gap-1">
              <Avatar className="h-4 w-4">
                {card.claimer.image && <AvatarImage src={card.claimer.image} alt="" />}
                <AvatarFallback className="text-[8px]">
                  {initials(card.claimer.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground text-[11px]">
                {firstName(card.claimer.name)}
              </span>
            </span>
          )}
          {card.collision && <CollisionMark note={card.collision.note} />}
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] underline-offset-2 hover:underline"
              style={{ color: 'var(--ink-mute)' }}
            >
              {prLabel(prUrl)}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
