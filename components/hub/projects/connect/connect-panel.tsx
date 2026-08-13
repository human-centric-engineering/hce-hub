'use client';

/**
 * Connect-a-repo panel (f-mcp-project-scope §31 t-D) — the member's self-service
 * surface for binding a Claude Code session to this project. A member gets **one**
 * project-scoped key here: generate it (auto-named server-side), see the one-time
 * secret with a ready-to-paste `.mcp.json` snippet, then **regenerate** (fresh
 * secret) or revoke as needed — all over the t-C member-key API
 * (`/api/v1/projects/:id/mcp-keys`).
 */

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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

// Validate at the boundary (CLAUDE.md) — responses are parsed, not trusted by shape.
const keyRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});
type KeyRow = z.infer<typeof keyRowSchema>;
const keysResponseSchema = z.object({ keys: z.array(keyRowSchema) });
const mintedSchema = z.object({ keyPrefix: z.string(), plaintext: z.string() });

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

export function ConnectPanel({ projectId, projectName, serverName, repoUrls }: ConnectPanelProps) {
  const base = `/api/v1/projects/${projectId}/mcp-keys`;

  // One key per project: `key` is the caller's key here, or null.
  const [key, setKey] = useState<KeyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The one-time plaintext secret, shown once after generate / regenerate.
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<'key' | 'config' | null>(null);

  const load = useCallback(async () => {
    try {
      const data = keysResponseSchema.parse(await apiClient.get(base));
      setKey(data.keys[0] ?? null);
      setError(null);
    } catch {
      setError('Couldn’t load your key just now — try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      // No body — the key is one-per-project and auto-named by the service.
      const data = mintedSchema.parse(await apiClient.post(base));
      setSecret(data.plaintext);
      await load();
    } catch {
      setError('Couldn’t generate the key.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      const data = mintedSchema.parse(await apiClient.post(`${base}/${key.id}/rotate`));
      setSecret(data.plaintext);
      await load();
    } catch {
      setError('Couldn’t regenerate the key.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.delete(`${base}/${key.id}`);
      setKey(null);
    } catch {
      setError('Couldn’t revoke the key.');
    } finally {
      setBusy(false);
    }
  }

  // Only flip to "Copied!" once the write actually lands — an insecure context or
  // denied permission rejects, and a false "Copied!" over a one-time secret loses it.
  async function copy(kind: 'key' | 'config', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied((c) => (c === kind ? null : c)), 1500);
    } catch {
      setError('Couldn’t copy to your clipboard — select the text and copy it manually.');
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-medium">Connect Claude Code to {projectName}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Generate a project-scoped key and paste it into your repo’s{' '}
          <code className="text-xs">.mcp.json</code>. The key binds the session to{' '}
          <strong>this project</strong> — every Hub tool runs scoped to it, and the key can’t reach
          another project. It acts as you, so keep it secret and don’t share it. You get one key per
          project; regenerate it for a fresh secret.
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

      {/* One-time secret + ready-to-paste config, shown after generate / regenerate. */}
      <Dialog
        open={secret !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSecret(null);
            setCopied(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Key ready — copy it now</DialogTitle>
            <DialogDescription>
              This secret is shown <strong>once</strong> and can’t be retrieved again. If you lose
              it, regenerate the key.
            </DialogDescription>
          </DialogHeader>
          {secret && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Key</Label>
                <div className="bg-muted mt-1 rounded-md p-3">
                  <code className="text-xs break-all">{secret}</code>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void copy('key', secret)}
                >
                  {copied === 'key' ? 'Copied!' : 'Copy key'}
                </Button>
              </div>
              <div>
                <Label className="text-xs">
                  Paste into your repo’s <code className="text-xs">.mcp.json</code>
                </Label>
                <pre className="bg-muted mt-1 overflow-x-auto rounded-md p-3 text-xs">
                  <code>{mcpConfig(serverName, origin, secret)}</code>
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => void copy('config', mcpConfig(serverName, origin, secret))}
                >
                  {copied === 'config' ? 'Copied!' : 'Copy .mcp.json snippet'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* One key per project: the CTA when none, the key card when one exists. */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : key ? (
        <div className="flex items-center justify-between gap-4 rounded-md border p-4">
          <div className="min-w-0">
            <p className="font-medium">{key.name}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              <code>{key.keyPrefix}…</code> · created {new Date(key.createdAt).toLocaleDateString()}{' '}
              · last used {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'never'}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRegenerate()}
              disabled={busy}
            >
              {busy ? 'Regenerating…' : 'Regenerate'}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive" disabled={busy}>
                  Revoke
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Any Claude Code session using it loses access immediately. You’d generate a new
                    key to reconnect.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void handleRevoke()}
                  >
                    Revoke
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-muted-foreground mb-3 text-sm">
            No key yet. Generate one to connect Claude Code to this project.
          </p>
          <Button size="sm" onClick={() => void handleGenerate()} disabled={busy}>
            {busy ? 'Generating…' : 'Generate key'}
          </Button>
        </div>
      )}
    </div>
  );
}
