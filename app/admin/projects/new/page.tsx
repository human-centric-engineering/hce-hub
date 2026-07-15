import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSelectableUsers } from '@/lib/projects/admin-page-data';
import { ProjectCreateForm } from '@/components/admin/projects/project-create-form';

export const metadata: Metadata = {
  title: 'New project',
  description: 'Create a Hub project',
};

export default async function NewProjectPage() {
  const users = await getSelectableUsers();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/admin/projects"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center text-sm"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Projects
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New project</h1>
      <ProjectCreateForm users={users} />
    </div>
  );
}
