'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient, APIClientError } from '@/lib/api/client';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';
import type { ProjectMemberRow, UserOption } from '@/components/admin/projects/types';

interface ProjectMembersProps {
  projectId: string;
  members: ProjectMemberRow[];
  leadUserId: string | null;
  users: UserOption[];
}

export function ProjectMembers({ projectId, members, leadUserId, users }: ProjectMembersProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [addUserId, setAddUserId] = useState('');

  const memberIds = new Set(members.map((m) => m.userId));
  const addable = users.filter((u) => !memberIds.has(u.id));

  const addMember = async () => {
    if (!addUserId) return;
    setPending(true);
    setError(null);
    try {
      await apiClient.post(PROJECT_ADMIN_API.members(projectId), { body: { userId: addUserId } });
      setAddUserId('');
      router.refresh();
    } catch (err) {
      setError(err instanceof APIClientError ? err.message : 'Failed to add member');
    } finally {
      setPending(false);
    }
  };

  const removeMember = async (userId: string) => {
    setPending(true);
    setError(null);
    try {
      await apiClient.delete(PROJECT_ADMIN_API.member(projectId, userId));
      router.refresh();
    } catch (err) {
      setError(err instanceof APIClientError ? err.message : 'Failed to remove member');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select value={addUserId} onValueChange={setAddUserId} disabled={addable.length === 0}>
            <SelectTrigger>
              <SelectValue
                placeholder={addable.length === 0 ? 'Everyone is a member' : 'Add a member…'}
              />
            </SelectTrigger>
            <SelectContent>
              {addable.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} · {u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => void addMember()} disabled={!addUserId || pending}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      {error && (
        <div className="border-destructive/50 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <ul className="divide-y rounded-lg border">
        {members.map((m) => {
          const isLead = m.userId === leadUserId;
          return (
            <li key={m.userId} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0">
                <span className="font-medium">
                  {m.user ? (
                    m.user.name
                  ) : (
                    <span className="text-muted-foreground italic">Former member</span>
                  )}
                </span>
                {m.user && (
                  <span className="text-muted-foreground ml-2 text-sm">{m.user.email}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={isLead ? 'default' : 'secondary'}>{m.role}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isLead || pending}
                  title={isLead ? 'Reassign the lead before removing them' : 'Remove member'}
                  onClick={() => void removeMember(m.userId)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
