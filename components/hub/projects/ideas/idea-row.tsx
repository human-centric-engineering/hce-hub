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
 *
 * **The jot renders as markdown** (§33-sweep t-112). Not a defect being fixed but
 * a change of intent: `Idea.text` was designed as "the raw jot" and plain text was
 * the right call for a short line. Ideas now routinely carry a repro, a fix shape
 * and cross-references — the triage reasoning that makes a sweep possible — and
 * that content wants formatting. The **editor stays plain**: you edit the source
 * you wrote, not a rendering of it.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Archive, RotateCcw, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { IDEA_TEXT_MAX } from '@/lib/projects/idea-constants';
import { Markdown } from '@/components/hub/markdown';
import { utcShortDate } from '@/components/hub/projects/presentation';
import type { IdeaView } from '@/components/hub/projects/ideas/types';

/**
 * When a jot is long enough to need collapsing. Measured from the **source**, not
 * from laid-out height: jsdom has no layout, so a `scrollHeight`-based clamp would
 * be untestable and would flicker between server and client render. The heuristic
 * only has to be conservative in one direction — a false "short" renders in full
 * (a taller row, never a clipped one), so the failure mode is a long row, not a
 * truncated idea with no way to read the rest.
 */
const CLAMP_CHARS = 320;
const CLAMP_LINES = 6;

function isLongJot(text: string): boolean {
  return text.length > CLAMP_CHARS || text.split('\n').length > CLAMP_LINES;
}

export function IdeaRow({ projectId, idea }: { projectId: string; idea: IdeaView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(idea.text);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const dropped = idea.status === 'dropped';
  const locked = busy || pending;
  const long = isLongJot(idea.text);

  // Grow the editor to fit its content — a fixed row count clips a long jot.
  const autosize = () => {
    const el = editRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    if (editing) autosize();
  }, [editing]);

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
    if (next.length === 0 || next.length > IDEA_TEXT_MAX) {
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
            ref={editRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              autosize();
            }}
            maxLength={IDEA_TEXT_MAX}
            rows={2}
            aria-label="Edit idea"
            className="resize-none"
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
            <div className="flex min-w-0 gap-2">
              {idea.number !== null && (
                <span
                  className="mt-0.5 shrink-0 font-mono text-xs"
                  style={{ color: 'var(--ink-faint)' }}
                >
                  #{idea.number}
                </span>
              )}
              <div className="min-w-0 flex-1">
                {/* Collapsed with a mask rather than a gradient overlay: the mask
                    fades the content itself, so it works over the open card AND the
                    sunken dropped card without either knowing the other's colour. */}
                <div
                  className={
                    long && !expanded
                      ? 'max-h-28 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]'
                      : undefined
                  }
                >
                  <Markdown content={idea.text} className="text-sm break-words" />
                </div>
                {long && (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="focus-visible:ring-ring mt-1 rounded-sm text-xs underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    style={{ color: 'var(--ink-mute)' }}
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
              captured by {idea.createdBy?.name ?? 'former member'} · {utcShortDate(idea.createdAt)}
              {dropped && idea.triagedAt ? ` · dropped ${utcShortDate(idea.triagedAt)}` : ''}
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
