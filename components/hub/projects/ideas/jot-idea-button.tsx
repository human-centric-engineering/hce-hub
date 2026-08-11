'use client';

/**
 * JotIdeaButton (f-idea-capture §22 t-62) — the quick-jot affordance in the
 * project header: capture a thought without leaving the current tab. Opens a small
 * popover, POSTs `…/ideas`, and `router.refresh()`es so the Ideas inbox (if open)
 * shows the new idea. The MCP `capture_idea` verb is the other capture face.
 *
 * No global keyboard shortcut — deferred to the future ⌘K command palette so we
 * don't pre-empt it (per the f-idea-capture decision).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

export function JotIdeaButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const locked = busy || pending;

  const capture = async () => {
    const jot = text.trim();
    if (jot.length === 0 || jot.length > 500) {
      setFailed(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: jot }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setText('');
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setFailed(true); // never silent
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFailed(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Lightbulb className="mr-1.5 h-4 w-4" aria-hidden />
          Jot an idea
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Jot an idea</p>
          <p className="text-muted-foreground text-xs">
            A quick thought — it lands in this project&rsquo;s inbox to triage later.
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // ⌘/Ctrl+Enter submits; plain Enter stays a newline (it's free text).
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void capture();
              }
            }}
            maxLength={500}
            rows={3}
            placeholder="e.g. board should remember my last filter"
            aria-label="Idea"
            disabled={locked}
            // Focus the field when the user opens the popover — a deliberate,
            // user-initiated focus (not autofocus-on-load, the a11y concern).
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            {failed ? (
              <span className="text-destructive text-xs">Couldn&rsquo;t capture — try again.</span>
            ) : (
              <span className="text-muted-foreground text-xs">⌘↵ to capture</span>
            )}
            <Button
              size="sm"
              onClick={() => void capture()}
              disabled={locked || text.trim() === ''}
            >
              Capture
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
