'use client';

/**
 * Connect-a-repo panel (f-mcp-project-scope §31 t-D) — the member's self-service
 * surface for binding a Claude Code session to this project. Mint a project-scoped
 * MCP key, see the ready-to-paste `.mcp.json` snippet (with the project's linked
 * repos for the match), and rotate / revoke — all over the t-C member-key API
 * (`/api/v1/projects/:id/mcp-keys`). The secret is shown exactly once.
 */

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { apiClient } from '@/lib/api/client';

// Validate at the boundary (CLAUDE.md) — the list + minted responses are parsed,
// not trusted by shape. Dates arrive as ISO strings (post-JSON).
const keyRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});
type KeyRow = z.infer<typeof keyRowSchema>;
const keysResponseSchema = z.object({ keys: z.array(keyRowSchema) });
const mintedSchema = z.object({ name: z.string(), keyPrefix: z.string(), plaintext: z.string() });

interface ConnectPanelProps {
  projectId: string;
  projectName: string;
  /** The server name used in the `.mcp.json` snippet (the project slug). */
  serverName: string;
  /** Git remotes linked to the project — shown so a member matches key ↔ repo. */
  repoUrls: string[];
}

/** The `.mcp.json` block a member pastes into their repo, with the live secret. */
function mcpConfig(serverName: string, origin: string, key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [serverName]: {
          type: 'http',
          url: `${origin}/api/v1/mcp`,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2
  );
}

function isExpired(expiresAt: string | null): boolean {
  return expiresAt !== null && new Date(expiresAt) < new Date();
}

export function ConnectPanel({ projectId, projectName, serverName, repoUrls }: ConnectPanelProps) {
  const base = `/api/v1/projects/${projectId}/mcp-keys`;

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  // The one-time secret + its config snippet (shown after create / rotate).
  const [secret, setSecret] = useState<{ label: string; plaintext: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = keysResponseSchema.parse(await apiClient.get(base));
      setKeys(data.keys);
      setError(null);
    } catch {
      setError('Couldn’t load your keys just now — try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const data = mintedSchema.parse(await apiClient.post(base, { body: { name: name.trim() } }));
      setName('');
      setCreateOpen(false);
      setSecret({ label: data.name, plaintext: data.plaintext });
      await load();
    } catch {
      setError('Couldn’t create the key.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(id: string) {
    setRotatingId(id);
    setError(null);
    try {
      const data = mintedSchema.parse(await apiClient.post(`${base}/${id}/rotate`));
      setSecret({ label: data.name, plaintext: data.plaintext });
      await load();
    } catch {
      setError('Couldn’t rotate the key.');
    } finally {
      setRotatingId(null);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    try {
      await apiClient.delete(`${base}/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      setError('Couldn’t revoke the key.');
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-medium">Connect Claude Code to {projectName}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Mint a project-scoped key and paste it into your repo’s{' '}
          <code className="text-xs">.mcp.json</code>. The key binds the session to{' '}
          <strong>this project</strong> — every Hub tool runs scoped to it, and the key can’t reach
          another project. It acts as you, so keep it secret and don’t share it.
        </p>
      </div>

      {/* The project's repos — so a member matches the key to the right checkout. */}
      <div className="text-sm">
        <span className="text-muted-foreground">Linked repos: </span>
        {repoUrls.length === 0 ? (
          <span className="text-muted-foreground italic">
            none linked yet (an admin can add them in project settings)
          </span>
        ) : (
          <span className="flex flex-wrap gap-1.5 pt-1">
            {repoUrls.map((r) => (
              <Badge key={r} variant="outline" className="font-mono text-[11px]">
                {r}
              </Badge>
            ))}
          </span>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {/* One-time secret + ready-to-paste config, shown after create / rotate. */}
      <Dialog open={secret !== null} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Key ready — copy it now</DialogTitle>
            <DialogDescription>
              This secret is shown <strong>once</strong> and can’t be retrieved again. If you lose
              it, rotate the key for a fresh one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Key ({secret?.label})</Label>
              <div className="bg-muted mt-1 rounded-md p-3">
                <code className="text-xs break-all">{secret?.plaintext}</code>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void navigator.clipboard.writeText(secret?.plaintext ?? '')}
              >
                Copy key
              </Button>
            </div>
            <div>
              <Label className="text-xs">
                Paste into your repo’s <code className="text-xs">.mcp.json</code>
              </Label>
              <pre className="bg-muted mt-1 overflow-x-auto rounded-md p-3 text-xs">
                <code>{secret ? mcpConfig(serverName, origin, secret.plaintext) : ''}</code>
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() =>
                  void navigator.clipboard.writeText(
                    secret ? mcpConfig(serverName, origin, secret.plaintext) : ''
                  )
                }
              >
                Copy .mcp.json snippet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generate a new key. */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setName('');
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm">Generate key</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate a project-scoped key</DialogTitle>
            <DialogDescription>
              Give it a name you’ll recognise (e.g. your machine or repo). The key is scoped to{' '}
              {projectName} and limited to the Hub coordination tools.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my laptop"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => void handleCreate()} disabled={!name.trim() || creating}>
              {creating ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The caller's own keys for this project. */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[150px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
                  No keys yet. Generate one to connect Claude Code to this project.
                </TableCell>
              </TableRow>
            ) : (
              keys.map((key) => {
                const expired = isExpired(key.expiresAt);
                return (
                  <TableRow key={key.id} className={expired ? 'opacity-50' : undefined}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs">{key.keyPrefix}…</code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {key.expiresAt ? (
                        expired ? (
                          <Badge variant="secondary">Expired</Badge>
                        ) : (
                          new Date(key.expiresAt).toLocaleDateString()
                        )
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => void handleRotate(key.id)}
                          disabled={rotatingId === key.id}
                        >
                          {rotatingId === key.id ? 'Rotating…' : 'Rotate'}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive text-xs">
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Any Claude Code session using it loses access immediately. This
                                can’t be undone — you’d generate a new key to reconnect.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => void handleRevoke(key.id)}
                              >
                                Revoke
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
