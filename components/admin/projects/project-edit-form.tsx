'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { AlertCircle, Archive, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { FieldHelp } from '@/components/ui/field-help';
import { apiClient, APIClientError } from '@/lib/api/client';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import { HOST_PLATFORMS, isKnownHostPlatform } from '@/lib/projects/host-platforms';
import { splitRepoUrls, joinRepoUrls } from '@/components/admin/projects/repo-urls';
import type { ProjectDetailDTO, UserOption } from '@/components/admin/projects/types';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
  hostPlatform: z.string().refine(isKnownHostPlatform, 'Choose a host platform'),
  leadUserId: z.string().min(1, 'Choose a project lead'),
  status: z.enum(['planning', 'active', 'archived']),
  repoUrlsText: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

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
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: project.name,
      hostPlatform: project.hostPlatform,
      leadUserId: project.leadUserId ?? '',
      status: project.status,
      repoUrlsText: joinRepoUrls(project.repoUrls),
    },
  });

  const hostPlatform = watch('hostPlatform');
  const leadUserId = watch('leadUserId');
  const status = watch('status');

  const onSubmit = async (data: FormData) => {
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
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="name">Name</Label>
          <FieldHelp title="Project name">
            The display name for this project across the Hub.
          </FieldHelp>
        </div>
        <Input id="name" {...register('name')} />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="hostPlatform">Host platform</Label>
          <FieldHelp title="Host platform">
            v1 supports <strong>Sunrise</strong> fully; others are recorded but not built out.
          </FieldHelp>
        </div>
        <Select
          value={hostPlatform}
          onValueChange={(v) => setValue('hostPlatform', v, { shouldValidate: true })}
        >
          <SelectTrigger id="hostPlatform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOST_PLATFORMS.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.label}
                {!p.supported && ' (stub)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.hostPlatform && (
          <p className="text-destructive text-sm">{errors.hostPlatform.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="leadUserId">Lead</Label>
          <FieldHelp title="Project lead">
            Reassigning the lead moves the lead role to the new person and keeps the previous lead
            as a member (their access is never dropped).
          </FieldHelp>
        </div>
        <Select
          value={leadUserId}
          onValueChange={(v) => setValue('leadUserId', v, { shouldValidate: true })}
        >
          <SelectTrigger id="leadUserId">
            <SelectValue placeholder="Select a lead" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} · {u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.leadUserId && (
          <p className="text-destructive text-sm">{errors.leadUserId.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="status">Status</Label>
          <FieldHelp title="Lifecycle status">
            A lifecycle state, not a deadline. Archived projects are hidden but never deleted.
          </FieldHelp>
        </div>
        <Select
          value={status}
          onValueChange={(v) =>
            setValue('status', v as FormData['status'], { shouldValidate: true })
          }
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="repoUrls">Repository URLs</Label>
          <FieldHelp title="Repositories">One URL per line.</FieldHelp>
        </div>
        <Textarea id="repoUrls" {...register('repoUrlsText')} rows={3} />
      </div>

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
