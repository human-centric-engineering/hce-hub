'use client';

import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form';
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
import { HOST_PLATFORMS } from '@/lib/projects/host-platforms';
import type { ProjectFormData } from '@/components/admin/projects/project-form-schema';
import type { UserOption } from '@/components/admin/projects/types';

interface ProjectFormFieldsProps {
  register: UseFormRegister<ProjectFormData>;
  errors: FieldErrors<ProjectFormData>;
  watch: UseFormWatch<ProjectFormData>;
  setValue: UseFormSetValue<ProjectFormData>;
  users: UserOption[];
  /** Only the URL-key help text differs: derive-if-blank vs. keep-if-blank. */
  mode: 'create' | 'edit';
}

/**
 * The shared name / URL key / host-platform / lead / status / repo-URL fields for
 * the create + edit project forms. Each form owns its own submit + actions; this
 * keeps the field set (and its validation) in one place.
 */
export function ProjectFormFields({
  register,
  errors,
  watch,
  setValue,
  users,
  mode,
}: ProjectFormFieldsProps) {
  const hostPlatform = watch('hostPlatform');
  const leadUserId = watch('leadUserId');
  const status = watch('status');

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="name">Name</Label>
          <FieldHelp title="Project name">
            The display name for this project across the Hub.
          </FieldHelp>
        </div>
        <Input id="name" {...register('name')} placeholder="e.g. Wayframer" />
        {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="slug">URL key</Label>
          <FieldHelp title="URL key (slug)">
            The shareable, durable address for this project — <code>/projects/wayframer</code>.
            Lowercase words joined by single hyphens, and{' '}
            <strong>unique across all projects</strong> (a key already in use is rejected when you
            save).{' '}
            {mode === 'create' ? (
              <>Leave blank to derive one from the name.</>
            ) : (
              <>
                Leave blank to keep the current key. Renaming the project never changes it — a
                shared link must not break — and the project&apos;s id URL keeps working either way.
              </>
            )}
          </FieldHelp>
        </div>
        <Input
          id="slug"
          {...register('slug')}
          placeholder={mode === 'create' ? 'Derived from the name if left blank' : 'e.g. wayframer'}
          aria-describedby="slug-prefix"
        />
        <p id="slug-prefix" className="text-muted-foreground text-xs">
          /projects/<span className="font-mono">{watch('slug') || '…'}</span>
        </p>
        {errors.slug && <p className="text-destructive text-sm">{errors.slug.message}</p>}
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
            immediately. Reassigning it later keeps the previous lead as a member (their access is
            never dropped).
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
            setValue('status', v as ProjectFormData['status'], { shouldValidate: true })
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
          placeholder="https://github.com/org/repo"
        />
        {errors.repoUrlsText && (
          <p className="text-destructive text-sm">{errors.repoUrlsText.message}</p>
        )}
      </div>
    </>
  );
}
