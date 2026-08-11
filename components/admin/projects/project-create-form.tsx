'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, APIClientError } from '@/lib/api/client';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import { splitRepoUrls } from '@/components/admin/projects/repo-urls';
import { ProjectFormFields } from '@/components/admin/projects/project-form-fields';
import {
  projectFormSchema,
  type ProjectFormData,
} from '@/components/admin/projects/project-form-schema';
import type { UserOption } from '@/components/admin/projects/types';

export function ProjectCreateForm({ users }: { users: UserOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError: setFieldError,
    watch,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: '',
      slug: '',
      hostPlatform: 'sunrise',
      leadUserId: '',
      status: 'planning',
    },
  });

  const onSubmit = async (data: ProjectFormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const project = await apiClient.post<{ id: string }>(PROJECT_ADMIN_API.create, {
        body: {
          name: data.name,
          // Omitted when blank so the server derives (and auto-dedupes) one from
          // the name; an explicit key is used verbatim and 409s if it's taken.
          ...(data.slug === '' ? {} : { slug: data.slug }),
          hostPlatform: data.hostPlatform,
          leadUserId: data.leadUserId,
          status: data.status,
          repoUrls: splitRepoUrls(data.repoUrlsText),
        },
      });
      // Navigation unmounts the form, so `submitting` stays true until it does
      // (keeps the button disabled — no double-submit).
      router.push(`/admin/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      // A 409 is always the slug `@unique` — pin it to the field that caused it.
      // Unless the box was blank: then the server derived the slug and lost a
      // race, which is not the admin's field to fix (a message on an empty box
      // would read as nonsense), so that falls through to the top-level error.
      if (err instanceof APIClientError && err.status === 409 && data.slug !== '') {
        setFieldError('slug', { message: `“${data.slug}” is already taken — choose another.` });
      } else {
        setError(err instanceof APIClientError ? err.message : 'Failed to create project');
      }
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="max-w-2xl space-y-6">
      <ProjectFormFields
        register={register}
        errors={errors}
        watch={watch}
        setValue={setValue}
        users={users}
        mode="create"
      />

      {error && (
        <div className="border-destructive/50 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          <Save className="mr-2 h-4 w-4" />
          {submitting ? 'Creating…' : 'Create project'}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href="/admin/projects">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
