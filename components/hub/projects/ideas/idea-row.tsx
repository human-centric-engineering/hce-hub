'use client';

/**
 * IdeaRow (f-idea-capture §22 t-62) — one inbox idea: its text, who captured it,
 * and the low-structure human actions. `open` ideas can be **edited** (refine the
 * jot) or **dropped** (archived); `dropped` ideas can be **restored** or edited.
 *
 * Promotion (→ feature/task/phase/bug) is deliberately absent here — it's
 * capability-mediated (Claude Code now, the conversational sidekick later), not a
 * web button. Mutations PATCH `…/ideas/:ideaId` and `router.refresh()` so the
 * server-rendered inbox re-reads; a failed write is surfaced inline, never
 * swallowed (the phase-picker pattern).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Archive, RotateCcw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { IdeaView } from '@/components/hub/projects/ideas/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO → "11 Aug 2026" — a locale-free, SSR-stable format (no hydration drift). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function IdeaRow({ projectId, idea }: { projectId: string; idea: IdeaView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(idea.text);

  const dropped = idea.status === 'dropped';
  const locked = busy || pending;

  const patch = async (body: { text: string } | { status: 'open' | 'dropped' }) => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(idea.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditing(false);
      startTransition(() => router.refresh());
    } catch {
      setFailed(true); // never silent
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = () => {
    const next = draft.trim();
    if (next.length === 0 || next.length > 500) {
      setFailed(true);
      return;
    }
    if (next === idea.text) {
      setEditing(false);
      return;
    }
    void patch({ text: next });
  };

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: 'var(--line)',
        backgroundColor: dropped ? 'var(--bg-sunken)' : undefined,
        opacity: dropped && !editing ? 0.75 : 1,
      }}
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            rows={2}
            aria-label="Edit idea"
            disabled={locked}
            // Focus the field when the user clicks Edit — a deliberate,
            // user-initiated focus (not autofocus-on-load, the a11y concern).
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={saveEdit} disabled={locked}>
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(idea.text);
                setEditing(false);
                setFailed(false);
              }}
              disabled={locked}
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden />
              Cancel
            </Button>
            {failed && (
              <span className="text-destructive text-xs">Couldn&rsquo;t save — try again.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm break-words">{idea.text}</p>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
              captured by {idea.createdBy?.name ?? 'former member'} · {formatDate(idea.createdAt)}
              {dropped && idea.triagedAt ? ` · dropped ${formatDate(idea.triagedAt)}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {failed && <span className="text-destructive mr-1 text-xs">!</span>}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(idea.text);
                setEditing(true);
                setFailed(false);
              }}
              disabled={locked}
              title="Edit this idea"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Edit</span>
            </Button>
            {dropped ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void patch({ status: 'open' })}
                disabled={locked}
                title="Restore this idea to the inbox"
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
                Restore
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void patch({ status: 'dropped' })}
                disabled={locked}
                title="Drop this idea (archived — reversible)"
              >
                <Archive className="mr-1 h-3.5 w-3.5" aria-hidden />
                Drop
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
