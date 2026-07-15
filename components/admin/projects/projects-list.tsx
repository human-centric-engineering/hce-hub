'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getHostPlatform } from '@/lib/projects/host-platforms';
import { ProjectStatusBadge } from '@/components/admin/projects/project-status-badge';
import type { ProjectRow } from '@/components/admin/projects/types';

function platformLabel(slug: string): string {
  return getHostPlatform(slug)?.label ?? slug;
}

export function ProjectsList({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Create projects, manage members, and set up project knowledge.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          No projects yet.{' '}
          <Link href="/admin/projects/new" className="text-foreground underline">
            Create the first one
          </Link>
          .
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/admin/projects/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{platformLabel(p.hostPlatform)}</Badge>
                  </TableCell>
                  <TableCell>{p.memberCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.lead ? p.lead.name : <span className="italic">Unassigned</span>}
                  </TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
