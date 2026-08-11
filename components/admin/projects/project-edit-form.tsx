'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { AlertCircle, Archive, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { apiClient, APIClientError } from '@/lib/api/client';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import { splitRepoUrls, joinRepoUrls } from '@/components/admin/projects/repo-urls';
import { ProjectFormFields } from '@/components/admin/projects/project-form-fields';
import {
  projectFormSchema,
  type ProjectFormData,
} from '@/components/admin/projects/project-form-schema';
import type { ProjectDetailDTO, UserOption } from '@/components/admin/projects/types';

interface ProjectEditFormProps {
  project: ProjectDetailDTO;
  users: UserOption[];
}

export function ProjectEditForm({ project, users }: ProjectEditFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);

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
      name: project.name,
      slug: project.slug ?? '',
      hostPlatform: project.hostPlatform,
      leadUserId: project.leadUserId ?? '',
      status: project.status,
      repoUrlsText: joinRepoUrls(project.repoUrls),
    },
  });

  const onSubmit = async (data: ProjectFormData) => {
    // Clearing an existing key would be a silent no-op (the API has no "unset"),
    // so say so rather than saving the rest and leaving the box looking applied.
    if (project.slug && data.slug === '') {
      setFieldError('slug', {
        message: 'A URL key can’t be removed once set — shared links would break.',
      });
      return;
    }

    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await apiClient.patch(PROJECT_ADMIN_API.detail(project.id), {
        body: {
          name: data.name,
          // Omitted when blank — the API treats a slug as explicit-only, so
          // sending nothing is what "leave it alone" means.
          ...(data.slug === '' ? {} : { slug: data.slug }),
          hostPlatform: data.hostPlatform,
          leadUserId: data.leadUserId,
          status: data.status,
          repoUrls: splitRepoUrls(data.repoUrlsText),
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      // A 409 is always the slug `@unique` — pin it to the field that caused it
      // instead of a top-level "save failed" the admin has to decode. A blank box
      // sends no slug, so it can't be the cause: that falls through below.
      if (err instanceof APIClientError && err.status === 409 && data.slug !== '') {
        setFieldError('slug', { message: `“${data.slug}” is already taken — choose another.` });
      } else {
        setError(err instanceof APIClientError ? err.message : 'Failed to save project');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async () => {
    setArchiving(true);
    setError(null);
    try {
      await apiClient.delete(PROJECT_ADMIN_API.detail(project.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof APIClientError ? err.message : 'Failed to archive project');
    } finally {
      setArchiving(false);
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
        mode="edit"
      />

      {error && (
        <div className="border-destructive/50 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {saved && !error && <p className="text-sm text-green-600">Saved.</p>}

      <div className="flex items-center justify-between">
        <Button type="submit" disabled={submitting}>
          <Save className="mr-2 h-4 w-4" />
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>

        {project.status !== 'archived' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive">
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive this project?</AlertDialogTitle>
                <AlertDialogDescription>
                  Archiving hides the project from active views. It is reversible — set the status
                  back to Planning or Active to restore it. Nothing is deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void archive()} disabled={archiving}>
                  {archiving ? 'Archiving…' : 'Archive'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </form>
  );
}
