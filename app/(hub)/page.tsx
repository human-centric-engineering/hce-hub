import Link from 'next/link';
import { FolderKanban } from 'lucide-react';

/**
 * Hub Home (`/`) — the cross-module entry point (f-shell).
 *
 * Reclaims `/` from f-fork's redirect shim. A deliberately light landing in
 * t-1 (a welcome + the Projects module entry); the richer cross-module summary
 * grows as modules land. Title inherits the layout default (`HCE Hub`).
 */
export default function HubHome(): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-[28px] font-medium tracking-[-0.025em]">Welcome to the Hub</h1>
        <p className="text-muted-foreground mt-1 text-[15px]">
          Your studio&apos;s project coordination workspace.
        </p>
      </header>

      <Link
        href="/projects"
        className="border-border hover:border-foreground/25 flex items-start gap-3 rounded-lg border p-4 transition-colors"
      >
        <FolderKanban className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Projects</span>
          <span className="text-muted-foreground text-[13px]">
            Plans, boards, and what&apos;s in flight across the studio.
          </span>
        </span>
      </Link>
    </div>
  );
}
