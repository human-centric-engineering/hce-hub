'use client';

/**
 * GitHub connection — account section (f-github-identity §23 t-75).
 *
 * The member's self-service surface for linking / unlinking their GitHub identity
 * (f-github-identity), registered into the account-section seam so it renders on
 * `/profile` and `/settings`. Drives the t-74 routes:
 *   GET    /api/v1/users/me/github          — current link state
 *   GET    /api/v1/users/me/github/connect  — start the OAuth round-trip (navigation)
 *   DELETE /api/v1/users/me/github          — unlink
 */

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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

// Validate at the boundary (CLAUDE.md) — the response is parsed, not trusted by shape.
const linkStateSchema = z.object({
  connected: z.boolean(),
  githubLogin: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  connectedAt: z.string().nullable().optional(),
  configured: z.boolean(),
});
type LinkState = z.infer<typeof linkStateSchema>;

const BASE = '/api/v1/users/me/github';
const CONNECT_URL = `${BASE}/connect`;

/** The `?github=<status>` the callback appends to /settings after a round-trip. */
const STATUS_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'GitHub account connected.' },
  cancelled: { ok: false, text: 'GitHub connection was cancelled.' },
  error: { ok: false, text: 'Couldn’t connect your GitHub account — please try again.' },
  'already-linked': {
    ok: false,
    text: 'That GitHub account is already linked to another Hub user.',
  },
};

export function GithubConnection() {
  const [state, setState] = useState<LinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState<string | null>(null);

  // Read the post-redirect status from the URL client-side (avoids opting the
  // whole section into useSearchParams' Suspense contract).
  useEffect(() => {
    setStatusKey(new URLSearchParams(window.location.search).get('github'));
  }, []);

  const load = useCallback(async () => {
    try {
      setState(linkStateSchema.parse(await apiClient.get(BASE)));
      setError(null);
    } catch {
      setError('Couldn’t load your GitHub connection just now — try refreshing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDisconnect() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.delete(BASE);
      await load();
    } catch {
      setError('Couldn’t disconnect — please try again.');
    } finally {
      setBusy(false);
    }
  }

  const status = statusKey ? STATUS_MESSAGES[statusKey] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub</CardTitle>
        <CardDescription>
          Connect your GitHub account so your merged pull requests and authored work in Hub projects
          are attributed to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <p
            className={
              status.ok ? 'text-sm text-green-600 dark:text-green-400' : 'text-destructive text-sm'
            }
          >
            {status.text}
          </p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !state?.configured ? (
          <p className="text-muted-foreground text-sm">
            GitHub connection isn’t available on this deployment.
          </p>
        ) : state.connected ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage
                  src={state.avatarUrl ?? undefined}
                  alt={state.githubLogin ?? 'GitHub'}
                />
                <AvatarFallback>
                  {(state.githubLogin ?? '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">@{state.githubLogin}</p>
                <Badge variant="outline" className="text-green-600 dark:text-green-400">
                  Connected
                </Badge>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive" disabled={busy}>
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
                  <AlertDialogDescription>
                    New merges won’t be attributed to you until you reconnect. This doesn’t change
                    anything already recorded.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void handleDisconnect()}
                  >
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">No GitHub account connected.</p>
            {/* A full navigation (not client routing) so the OAuth redirect runs. */}
            <Button asChild>
              <a href={CONNECT_URL}>Connect GitHub</a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
