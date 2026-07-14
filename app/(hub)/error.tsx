'use client';

/**
 * Hub Routes Error Boundary (f-shell)
 *
 * Catches errors within the `(hub)` group (`/`, `/projects`, `/brief`). Because
 * it sits below `app/(hub)/layout.tsx`, the shell chrome persists and the error
 * renders in the main column (not a whole-page replacement). Detects session
 * expiry and prompts re-login; otherwise offers retry + a route back to the Hub
 * home. Mirrors `app/(protected)/error.tsx`.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ErrorCard } from '@/components/ui/error-card';
import { logger } from '@/lib/logging';
import { authClient } from '@/lib/auth/client';
import { trackError, ErrorSeverity } from '@/lib/errors/sentry';

export default function HubError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  useEffect(() => {
    logger.error('Hub route error boundary triggered', error, {
      boundaryName: 'HubError',
      errorType: 'boundary',
      digest: error.digest,
    });

    const checkSession = async (): Promise<void> => {
      try {
        const session = await authClient.getSession();
        if (!session) {
          setIsSessionExpired(true);
          logger.warn('Session expired in Hub route', { boundaryName: 'HubError' });
        }
      } catch {
        setIsSessionExpired(true);
      }
    };

    void checkSession();

    // Log + report ONCE on mount. `isSessionExpired` is deliberately NOT a dep and
    // NOT in the tracked extra: it is set by the async checkSession() above, so
    // depending on it would re-fire this effect (a duplicate log + Sentry event)
    // once expiry resolves — the Sunrise platform boundaries carry that bug
    // (sunrise#433); this is the corrected reference pattern.
    trackError(error, {
      tags: { boundary: 'hub', errorType: 'boundary' },
      extra: { digest: error.digest },
      level: ErrorSeverity.Error,
    });
  }, [error]);

  // Session expired — show login prompt
  if (isSessionExpired) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <LogIn className="h-5 w-5" />
              <CardTitle>Session Expired</CardTitle>
            </div>
            <CardDescription>
              Your session has expired. Please sign in again to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/login')} className="w-full">
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ErrorCard
      title="Something went wrong"
      description="An error occurred while loading this page. This has been logged."
      error={error}
      actions={[
        { label: 'Try again', onClick: reset },
        {
          label: 'Hub home',
          onClick: () => router.push('/'),
          variant: 'outline',
          icon: <Home className="mr-2 h-4 w-4" />,
        },
      ]}
    />
  );
}
