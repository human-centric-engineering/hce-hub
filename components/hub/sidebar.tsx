'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Sunrise } from 'lucide-react';
import { BrandMark } from '@/components/brand/brand-mark';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils/initials';
import { getHubModules } from '@/lib/app/hub-modules';

/**
 * Hub sidebar (f-shell) — brand · Hub section · Modules section · footer.
 *
 * The **Modules** section is driven by the fork-owned module registry
 * (`lib/app/hub-modules.ts`), so adding a module needs no edit here. Active state
 * is derived from the pathname (route-driven, per the composable-shell
 * guardrail). Identity (name/avatar/role) comes from the session, passed down by
 * the shell.
 */
export interface SidebarUser {
  name: string;
  image: string | null;
  role: string | null;
}

function SectionLabel({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <div
      className="text-muted-foreground/70 mb-1.5 px-2 text-[10px] tracking-[0.1em] uppercase"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {children}
    </div>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  soon,
}: {
  href?: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  soon?: boolean;
}): React.ReactNode {
  const base =
    'flex items-center gap-2.5 rounded-[4px] px-2 py-1.5 text-[13.5px] transition-colors';

  if (soon || !href) {
    return (
      <span className={`${base} text-muted-foreground/60 cursor-not-allowed`} aria-disabled="true">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        <span>{label}</span>
        <span className="ml-auto text-[10px] opacity-80" style={{ fontFamily: 'var(--font-mono)' }}>
          soon
        </span>
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-foreground/80 hover:bg-accent hover:text-foreground'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? '' : 'opacity-70'}`} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ user }: { user: SidebarUser }): React.ReactNode {
  const pathname = usePathname();
  const modules = getHubModules();

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="bg-secondary border-border sticky top-0 flex h-screen flex-col gap-4 overflow-y-auto border-r px-3.5 py-4">
      <Link
        href="/"
        className="hover:bg-accent flex items-center rounded-md px-1.5 py-1 transition-colors"
      >
        <BrandMark />
      </Link>

      <nav className="flex flex-col gap-0.5">
        <SectionLabel>Hub</SectionLabel>
        <NavItem href="/" icon={Home} label="Home" active={pathname === '/'} />
        {/* Morning brief lands with f-morning-brief (/brief); stubbed until then. */}
        <NavItem icon={Sunrise} label="Morning brief" soon />
      </nav>

      <nav className="flex flex-col gap-0.5">
        <SectionLabel>Modules</SectionLabel>
        {modules.map((m) =>
          m.status === 'active' ? (
            <NavItem
              key={m.slug}
              href={m.href}
              icon={m.icon}
              label={m.label}
              active={isActive(m.href)}
            />
          ) : (
            <NavItem key={m.slug} icon={m.icon} label={m.label} soon />
          )
        )}
      </nav>

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
            className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-[4px] px-2 py-1.5 text-[13px] transition-colors"
          >
            Admin
          </Link>
        )}
      </div>
    </aside>
  );
}
