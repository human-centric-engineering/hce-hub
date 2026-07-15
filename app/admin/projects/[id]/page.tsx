import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getProjectDetail, getSelectableUsers } from '@/lib/projects/admin-page-data';
import { ProjectEditForm } from '@/components/admin/projects/project-edit-form';
import { ProjectMembers } from '@/components/admin/projects/project-members';
import { ProjectStatusBadge } from '@/components/admin/projects/project-status-badge';

export const metadata: Metadata = {
  title: 'Edit project',
  description: 'Manage a Hub project, its members, and knowledge',
};

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, users] = await Promise.all([getProjectDetail(id), getSelectableUsers()]);

  if (!project) notFound();

  return (
    <div className="container mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <Link
          href="/admin/projects"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center text-sm"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Projects
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Details</h2>
        <ProjectEditForm project={project} users={users} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Members</h2>
        <ProjectMembers
          projectId={project.id}
          members={project.members}
          leadUserId={project.leadUserId}
          users={users}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Knowledge base</h2>
        {project.knowledgeTag ? (
          <div className="text-muted-foreground rounded-lg border p-4 text-sm">
            <p>
              This project has the knowledge tag{' '}
              <code className="text-foreground">{project.knowledgeTag.slug}</code>. Upload documents
              in the{' '}
              <Link href="/admin/orchestration/knowledge" className="text-foreground underline">
                knowledge base admin
              </Link>{' '}
              and tag them <code className="text-foreground">{project.knowledgeTag.name}</code> to
              scope them to this project&apos;s sidekick.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No knowledge tag attached.</p>
        )}
      </section>
    </div>
  );
}
