'use client';

/**
 * IdeasView (f-idea-capture §22 t-62) — the project's idea inbox: a list SEPARATE
 * from the plan/board (ideas aren't committed work). Two bands, toggled: the
 * **Inbox** (open ideas, to triage) and the **Dropped** archive (reversible).
 *
 * The low-structure human ops live here (edit / drop / restore, per row).
 * **Promotion** (idea → feature/task/phase/bug) is intentionally NOT a button:
 * it's capability-mediated — done from Claude Code today, and a conversational
 * sidekick later (a raw jot needs shaping the create verbs can't do from a form).
 * The hint below sets that expectation.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { IdeaRow } from '@/components/hub/projects/ideas/idea-row';
import type { IdeaInboxDTO } from '@/components/hub/projects/ideas/types';

type Band = 'open' | 'dropped';

export function IdeasView({ projectId, inbox }: { projectId: string; inbox: IdeaInboxDTO }) {
  const [band, setBand] = useState<Band>('open');

  const open = inbox.ideas.filter((i) => i.status === 'open');
  const dropped = inbox.ideas.filter((i) => i.status === 'dropped');
  const shown = band === 'open' ? open : dropped;

  const tab = (key: Band, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={band === key}
      onClick={() => setBand(key)}
      className={cn(
        'focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
        band === key
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1" role="tablist" aria-label="Idea band">
          {tab('open', 'Inbox', open.length)}
          {tab('dropped', 'Dropped', dropped.length)}
        </div>
        <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Promote an idea into a feature, task, phase, or bug from Claude Code.
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {band === 'open'
            ? 'No ideas in the inbox. Jot one with “Jot an idea”, or capture from Claude Code.'
            : 'Nothing dropped. Dropped ideas are archived here and can be restored.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((idea) => (
            <IdeaRow key={idea.id} projectId={projectId} idea={idea} />
          ))}
        </div>
      )}
    </div>
  );
}
