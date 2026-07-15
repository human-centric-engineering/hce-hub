'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Save } from 'lucide-react';
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
import { FieldHelp } from '@/components/ui/field-help';
import { apiClient, APIClientError } from '@/lib/api/client';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import { HOST_PLATFORMS, isKnownHostPlatform } from '@/lib/projects/host-platforms';
import { splitRepoUrls } from '@/components/admin/projects/repo-urls';
import type { UserOption } from '@/components/admin/projects/types';

const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'Name is too long'),
  hostPlatform: z.string().refine(isKnownHostPlatform, 'Choose a host platform'),
  leadUserId: z.string().min(1, 'Choose a project lead'),
  status: z.enum(['planning', 'active', 'archived']),
  repoUrlsText: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export function ProjectCreateForm({ users }: { users: UserOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', hostPlatform: 'sunrise', leadUserId: '', status: 'planning' },
  });

  const hostPlatform = watch('hostPlatform');
  const leadUserId = watch('leadUserId');
  const status = watch('status');

  const onSubmit = async (data: FormData) => {
    setSubmitting(true);
    setError(null);
    try {
      const project = await apiClient.post<{ id: string }>(PROJECT_ADMIN_API.create, {
        body: {
          name: data.name,
          hostPlatform: data.hostPlatform,
          leadUserId: data.leadUserId,
          status: data.status,
          repoUrls: splitRepoUrls(data.repoUrlsText),
        },
      });
      router.push(`/admin/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof APIClientError ? err.message : 'Failed to create project');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="name">Name</Label>
          <FieldHelp title="Project name">
            The display name for this project across the Hub. You can change it later.
          </FieldHelp>
        </div>
        <Input id="name" {...register('name')} placeholder="e.g. Wayframer" />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="hostPlatform">Host platform</Label>
          <FieldHelp title="Host platform">
            The platform this project is built on. v1 supports <strong>Sunrise</strong> fully; the
            others are recorded but not yet built out.
          </FieldHelp>
        </div>
        <Select
          value={hostPlatform}
          onValueChange={(v) => setValue('hostPlatform', v, { shouldValidate: true })}
        >
          <SelectTrigger id="hostPlatform">
            <SelectValue placeholder="Select a platform" />
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
            The lead is added as a project member automatically and can access the project
            immediately. Change the lead later from the project page.
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
            <strong>Planning</strong> / <strong>Active</strong> / <strong>Archived</strong> — a
            lifecycle state, not a deadline. Archived projects are hidden but never deleted.
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
          <FieldHelp title="Repositories">
            One URL per line. Optional — the repos this project&apos;s work maps to.
          </FieldHelp>
        </div>
        <Textarea
          id="repoUrls"
          {...register('repoUrlsText')}
          rows={3}
          placeholder={'https://github.com/org/repo'}
        />
      </div>

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
