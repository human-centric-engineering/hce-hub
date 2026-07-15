/**
 * Loading skeleton for the projects surface (list + project view).
 *
 * The pages fetch server-side, so this shows an instant frame during
 * navigation. Scoped to the `projects` subtree (not the whole `(hub)` group) so
 * the near-instant Hub Home doesn't flash a skeleton.
 */
export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="bg-muted mb-6 h-8 w-40 animate-pulse rounded" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-muted h-[132px] animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  );
}
