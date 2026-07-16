'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Link2, Check, GitPullRequest, Terminal, MessageSquare, Lock, Folder } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { sanitizeUrl } from '@/lib/security/sanitize';
import { buildClaudeCodeCommand } from '@/lib/projects/claude-code-link';
import { useSidekick } from '@/components/hub/sidekick-context';
import { useTaskSheet } from '@/components/hub/projects/task-sheet/task-sheet-context';
import { StatusPill } from '@/components/hub/projects/plan/status-pill';
import { taskStatus, firstName, prLabel } from '@/components/hub/projects/plan/presentation';
import { initials } from '@/components/hub/projects/presentation';
import type {
  TaskDetailDTO,
  TaskDetailRef,
  ClaimResultDTO,
  ClaimWarning,
} from '@/components/hub/projects/task-sheet/types';

/** The width the sidekick column occupies + its gutter — the sheet anchors to its left. */
const SIDEKICK_OFFSET = 392;

type LoadState = 'loading' | 'error' | 'ready';

const sectionLabel = 'font-mono text-[10px] tracking-wider uppercase';

/** A small quiet action button. */
function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  children,
  primary,
}: {
  onClick?: () => void;
  disabled?: boolean;
  icon: typeof Check;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-tint)] disabled:cursor-not-allowed disabled:opacity-50"
      style={
        primary
          ? { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-fg, #fff)' }
          : { borderColor: 'var(--line)' }
      }
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/** A click-to-jump dependency row (blocker or dependent). */
function DepRow({ dep, onJump }: { dep: TaskDetailRef; onJump: (id: string) => void }) {
  const s = taskStatus(dep.status);
  return (
    <button
      type="button"
      onClick={() => onJump(dep.id)}
      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--bg-tint)]"
    >
      <span className="font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        {dep.number != null ? `t-${dep.number}` : dep.featureSlug ?? '—'}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs" style={{ color: 'var(--ink-soft)' }}>
        {dep.title}
      </span>
      <StatusPill tone={s.tone} label={s.label} />
    </button>
  );
}

/**
 * TaskSheet — the sliding task detail panel (f-task-sheet §11).
 *
 * Fetches one task's detail client-side (so opening never re-runs the page),
 * slides in over a scrim, closes on Esc / scrim / the close button, and anchors
 * to the left of the sidekick when it's open (`right: 392px`). t-3 fills the
 * body (description, files in scope, the two-way dependency graph) + the action
 * row (Claim via the shared claim service, Open PR, Open in Claude Code, Ask
 * sidekick), and does the dialog a11y pass (focus in on open, return focus on
 * close, `aria-modal`).
 */
export function TaskSheet({
  projectId,
  taskId,
  onClose,
}: {
  projectId: string;
  taskId: string;
  onClose: () => void;
}) {
  const { open: sidekickOpen, setOpen: setSidekickOpen } = useSidekick();
  const { open: openTask } = useTaskSheet();
  const [detail, setDetail] = useState<TaskDetailDTO | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [entered, setEntered] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(false);
  const [warnings, setWarnings] = useState<ClaimWarning[]>([]);
  const [copied, setCopied] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Slide in on mount.
  useEffect(() => setEntered(true), []);

  // Dialog a11y: focus the sheet on open, return focus to the opener on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    asideRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  // Clear the "copied" timer on unmount.
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const path = `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;

  // Per-task state clears when the sheet switches tasks, but NOT on a same-task
  // refetch — so a post-claim reload refreshes in place (keeping the content and
  // the just-surfaced warnings visible) instead of blanking to the skeleton.
  useEffect(() => {
    setWarnings([]);
    setClaimError(false);
    setDetail(null);
  }, [path]);

  // Fetch the detail on task change / after a claim (reloadKey). `detail` is left
  // in place here (cleared above only on task change), so the skeleton shows for
  // the initial load, not for a same-task refresh.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState('loading');
    fetch(path, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { data: TaskDetailDTO };
        if (active) {
          setDetail(json.data);
          setState('ready');
        }
      })
      .catch((err: unknown) => {
        if (active && !(err instanceof DOMException && err.name === 'AbortError')) {
          setState('error');
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, reloadKey]);

  // Esc closes the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyLink = () => void navigator.clipboard?.writeText(window.location.href);

  const claim = useCallback(async () => {
    setClaiming(true);
    setClaimError(false);
    try {
      const res = await fetch(`${path}/claim`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: ClaimResultDTO };
      setWarnings(json.data.warnings);
      setReloadKey((k) => k + 1); // refetch so status/claimer reflect the claim
    } catch {
      setClaimError(true); // surface it (never a silent write failure) — retryable
    } finally {
      setClaiming(false);
    }
  }, [path]);

  const copyClaudeCommand = () => {
    if (!detail) return;
    void navigator.clipboard?.writeText(
      buildClaudeCodeCommand({
        number: detail.number,
        title: detail.title,
        featureSlug: detail.feature.slug,
      })
    );
    setCopied(true);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const ref = detail?.number != null ? `t-${detail.number}` : `t-${taskId.slice(-4)}`;
  const status = detail ? taskStatus(detail.status) : null;
  const prUrl = detail?.prUrl ? sanitizeUrl(detail.prUrl) : '';
  const canClaim = detail?.status === 'available';
  const blocked = detail?.status === 'blocked';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden />
      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Task ${ref}`}
        className="bg-background fixed top-0 bottom-0 z-50 flex w-[440px] max-w-[calc(100vw-2rem)] flex-col border-l shadow-xl outline-none"
        style={{
          right: sidekickOpen ? SIDEKICK_OFFSET : 0,
          transform: entered ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease, right 200ms ease',
        }}
      >
        <header className="flex flex-col gap-3 border-b px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
                {ref}
              </span>
              {detail && (
                <>
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    ·
                  </span>
                  <span className="font-mono text-xs" style={{ color: 'var(--ink-mute)' }}>
                    {detail.feature.slug ?? detail.feature.title}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={copyLink}
                aria-label="Copy link to this task"
                className="hover:bg-muted rounded p-1"
              >
                <Link2 className="h-4 w-4" style={{ color: 'var(--ink-mute)' }} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hover:bg-muted rounded p-1"
              >
                <X className="h-4 w-4" style={{ color: 'var(--ink-mute)' }} />
              </button>
            </div>
          </div>

          {detail && (
            <>
              <h2 className="text-[17px] leading-snug font-medium">{detail.title}</h2>
              <div className="flex items-center gap-3">
                {status && <StatusPill tone={status.tone} label={status.label} />}
                {detail.claimer ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5">
                      {detail.claimer.image && <AvatarImage src={detail.claimer.image} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {initials(detail.claimer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-muted-foreground text-xs">
                      {firstName(detail.claimer.name)}
                      {detail.isMine && <span style={{ color: 'var(--accent)' }}> · you</span>}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                    unclaimed
                  </span>
                )}
              </div>

              {/* Action row */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canClaim && (
                  <ActionButton icon={Check} primary onClick={() => void claim()} disabled={claiming}>
                    {claiming ? 'Claiming…' : 'Claim'}
                  </ActionButton>
                )}
                {blocked && (
                  <ActionButton icon={Lock} disabled>
                    Blocked by deps
                  </ActionButton>
                )}
                {prUrl && (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-tint)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <GitPullRequest className="h-3.5 w-3.5" />
                    {prLabel(prUrl)}
                  </a>
                )}
                <ActionButton icon={Terminal} onClick={copyClaudeCommand}>
                  {copied ? 'Copied' : 'Open in Claude Code'}
                </ActionButton>
                <ActionButton icon={MessageSquare} onClick={() => setSidekickOpen(true)}>
                  Ask sidekick
                </ActionButton>
              </div>

              {claimError && (
                <p className="text-xs" style={{ color: 'var(--signal-blocked)' }}>
                  Couldn&rsquo;t claim just now — try again.
                </p>
              )}

              {warnings.length > 0 && (
                <ul className="flex flex-col gap-1 pt-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-xs" style={{ color: 'var(--accent-ink)' }}>
                      {w.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!detail && state === 'loading' && (
            <div className="space-y-3" aria-hidden>
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
              <div className="bg-muted h-3 w-full animate-pulse rounded" />
              <div className="bg-muted h-3 w-4/5 animate-pulse rounded" />
            </div>
          )}
          {!detail && state === 'error' && (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Couldn&rsquo;t load this task — try reopening it.
            </p>
          )}
          {detail && (
            <div className="flex flex-col gap-6">
              {/* Description */}
              <section className="flex flex-col gap-1.5">
                <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
                  What this is
                </div>
                {detail.description ? (
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
                    {detail.description}
                  </p>
                ) : (
                  <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                    No description yet.
                  </p>
                )}
              </section>

              {/* Files in scope */}
              <section className="flex flex-col gap-1.5">
                <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
                  Files in scope <span className="normal-case">· declared, not enforced</span>
                </div>
                {detail.filesScope.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {detail.filesScope.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <Folder className="h-3.5 w-3.5" style={{ color: 'var(--ink-faint)' }} />
                        <span className="font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                    No files declared.
                  </p>
                )}
              </section>

              {/* Dependency graph */}
              <section className="flex flex-col gap-2">
                <div className={sectionLabel} style={{ color: 'var(--ink-faint)' }}>
                  Dependencies
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="mb-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                      blocked by
                    </div>
                    {detail.blockedBy.length > 0 ? (
                      detail.blockedBy.map((d) => <DepRow key={d.id} dep={d} onJump={openTask} />)
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        none — ready to pull
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-1.5 text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                      blocks
                    </div>
                    {detail.blocks.length > 0 ? (
                      detail.blocks.map((d) => <DepRow key={d.id} dep={d} onJump={openTask} />)
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                        nothing waiting
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Activity timeline + sidekick notes are deferred — no v1 data source
                  (no per-task event feed; the sidekick lands in §12). */}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
