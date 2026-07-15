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
    watch,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project.name,
      hostPlatform: project.hostPlatform,
      leadUserId: project.leadUserId ?? '',
      status: project.status,
      repoUrlsText: joinRepoUrls(project.repoUrls),
    },
  });

  const onSubmit = async (data: ProjectFormData) => {
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await apiClient.patch(PROJECT_ADMIN_API.detail(project.id), {
        body: {
          name: data.name,
          hostPlatform: data.hostPlatform,
          leadUserId: data.leadUserId,
          status: data.status,
          repoUrls: splitRepoUrls(data.repoUrlsText),
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof APIClientError ? err.message : 'Failed to save project');
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
