import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects',
};

/**
 * Projects — placeholder (f-shell t-2).
 *
 * The Projects nav entry routes here so the shell is navigable end-to-end. The
 * real membership-scoped projects list + project container land in `f-projects`
 * (§08), which replaces this page.
 */
export default function ProjectsPlaceholder(): React.ReactNode {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-[28px] font-medium tracking-[-0.025em]">Projects</h1>
      <p className="text-muted-foreground mt-1 text-[15px]">
        The projects list arrives with the next feature.
      </p>
    </div>
  );
}
