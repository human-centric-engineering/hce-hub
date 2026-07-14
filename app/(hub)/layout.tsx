import type { Metadata } from 'next';
import { getServerSession } from '@/lib/auth/utils';
import { clearInvalidSession } from '@/lib/auth/clear-session';
import { HubShell } from '@/components/hub/hub-shell';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    template: `%s - ${BRAND.name}`,
    default: BRAND.name,
  },
  description: `${BRAND.name} — project coordination`,
};

/**
 * Hub Layout (f-shell) — the module-composable three-column shell, rooted at `/`.
 *
 * This is the ONE auth guard for the whole `(hub)` group (`/`, `/projects`,
 * `/brief`): `/` can't be edge-protected in `proxy.ts` (a `/` `startsWith` prefix
 * matches every route), so the group self-guards here with the house
 * `getServerSession()` → `clearInvalidSession()` pattern. `/projects` also keeps
 * its f-access edge gate (defence in depth). A signed-out visitor to any Hub
 * route is bounced to `/login`.
 *
 * The shell chrome only needs identity fields (name/email/image/role), which the
 * session already carries — so no user DB read here (mirrors `admin/layout.tsx`
 * reading `session.user.role`).
 */
export default async function HubLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();

  if (!session) {
    clearInvalidSession('/');
  }

  const { name, email, image, role } = session.user;

  return (
    <HubShell user={{ name, email, image: image ?? null, role: role ?? null }}>{children}</HubShell>
  );
}
