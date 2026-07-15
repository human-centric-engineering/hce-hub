/**
 * Sidekick column (f-shell) — the persistent 380px right panel.
 *
 * f-shell ships the column shell + its header; the real project-scoped chat
 * stream and agent arrive in `f-sidekick` (§12). Because it renders inside the
 * `(hub)` layout, it persists across main-column navigation once filled.
 */
export function SidekickColumn(): React.ReactNode {
  return (
    <aside className="border-border bg-background sticky top-0 flex h-screen flex-col border-l">
      <div className="border-border flex items-center gap-2.5 border-b px-4 py-3.5">
        <div
          className="grid h-[26px] w-[26px] place-items-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: 'var(--accent)', fontFamily: 'var(--font-mono)' }}
          aria-hidden="true"
        >
          sk
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-medium">Sidekick</span>
          <span
            className="text-muted-foreground text-[10px]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            arrives with f-sidekick
          </span>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted-foreground text-[13px]">
          The project sidekick chat arrives in a later feature.
        </p>
      </div>
    </aside>
  );
}
