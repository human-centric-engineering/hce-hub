/**
 * A quiet, signal-toned status pill (f-plan-view t-2) — a coloured dot + label.
 *
 * `tone` is a `--signal-*` base name (`merged`, `pr`, `claimed`, `available`,
 * `backlog`, `blocked`) resolved by `presentation.ts`; the fg/bg come from the
 * consumer surface's `--signal-<tone>` / `--signal-<tone>-bg` tokens. Renders as
 * a `<span>` so it's valid inside the expandable feature-row button.
 */
export function StatusPill({ tone, label }: { tone: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `var(--signal-${tone}-bg)`, color: `var(--signal-${tone})` }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(--signal-${tone})` }}
      />
      {label}
    </span>
  );
}
