import Link from 'next/link';
import { BrandMark } from '@/components/brand/brand-mark';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils/initials';

/**
 * HubShell — the module-composable three-column frame (f-shell).
 *
 * The consumer-surface Hub chrome: `240px sidebar | 1fr main` today, extended to
 * `… | 380px sidekick` when the sidekick is shown (t-2 wires the toggle; the grid
 * class is built to accept the third column). Rendered by `app/(hub)/layout.tsx`
 * after its auth guard, so every Hub route (`/`, `/projects`, `/brief`) inherits
 * this frame.
 *
 * **Deliberately context-free** (the f-shell composable-shell guardrail): the
 * shell assumes no project/module — Hub Home is itself a non-project page — so a
 * future uniform shell can re-parent the account pages under it without a rewrite.
 * The navigation sections + module registry, the topbar controls (breadcrumbs,
 * ⌘K, bell, sidekick toggle), and the sidekick column land in t-2; this ships the
 * spare-but-real frame (brand + footer + main/topbar containers) that validates
 * the routing/auth/layout architecture.
 */
export interface HubShellUser {
  name: string;
  email: string;
  image: string | null;
  role: string | null;
}

export function HubShell({
  user,
  children,
}: {
  user: HubShellUser;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="bg-background text-foreground grid min-h-screen grid-cols-[240px_1fr]">
      {/* Sidebar */}
      <aside className="bg-secondary border-border sticky top-0 flex h-screen flex-col gap-4 overflow-y-auto border-r px-3.5 py-4">
        <Link
          href="/"
          className="hover:bg-accent flex items-center rounded-md px-1.5 py-1 transition-colors"
        >
          <BrandMark />
        </Link>

        {/* Navigation sections (Hub · Modules · project-contextual) land in t-2 */}

        <div className="flex-1" />

        <div className="border-border flex flex-col gap-0.5 border-t pt-3">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Avatar className="h-[22px] w-[22px]">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback className="text-[9px]">{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="truncate text-[13px]">{user.name}</span>
          </div>
          {user.role === 'ADMIN' && (
            <Link
              href="/admin"
              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-2 py-1.5 text-[13px] transition-colors"
            >
              Admin
            </Link>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        {/* Topbar — breadcrumbs, ⌘K, bell, sidekick toggle land in t-2 */}
        <header className="border-border bg-background sticky top-0 z-10 flex h-[52px] items-center gap-4 border-b px-6" />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
