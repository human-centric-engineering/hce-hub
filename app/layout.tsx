import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import '@/app/globals.css';
import '@/app/brand-theme.css'; // fork-owned per-surface palette; must cascade after globals
import { ThemeProvider } from '@/hooks/use-theme';
import { ErrorHandlingProvider } from '@/app/error-handling-provider';
import { ConsentProvider } from '@/lib/consent';
import { CookieBanner } from '@/components/cookie-consent';
import { AnalyticsProvider } from '@/lib/analytics';
import { AnalyticsScripts, UserIdentifier, PageTracker } from '@/components/analytics';
import { SurfaceSync } from '@/components/surface-sync';
import { DEFAULT_SURFACE } from '@/lib/app/surface';
import { BRAND } from '@/lib/brand';

// KEEP-MINE (platform-divergences): the vanilla title hardcodes "- Next.js
// Starter" (and a starter-template description), leaking the starter identity
// into a fork's every un-templated tab. Drive the title fully from the BRAND
// seam instead: a bare `default` for the root, and a `%s - <brand>` template so
// every page that sets a plain title (account, admin, auth) gets branded
// consistently. Route groups with their own template (e.g. `(hub)`) still win.
export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s - ${BRAND.name}`,
  },
  description: `${BRAND.name} — internal operations platform.`,
  // KEEP-MINE (platform-divergences row 25 — its OWN row, not row 16's): vanilla
  // declares no `icons` at all, so the only icon any Sunrise app ever serves is
  // `/favicon.ico`, found by root convention rather than by a link.
  // `public/favicon.svg` ships upstream referenced by nothing (sunrise#640), which
  // is why branding the tab needed this block as well as the two asset files.
  //
  // Order is the fallback chain, not a preference: a browser takes the last
  // declaration it can render, so the ICO is listed first as the floor (Safari,
  // and anything else without SVG-favicon support) and the SVG last for the
  // browsers that can take it — which are also the ones that honour the file's
  // `prefers-color-scheme` block, so the tab mark follows the OS theme there and
  // stays on the light cut everywhere else.
  //
  // `sizes` is a **selection hint, not a manifest** — it is what the browser
  // compares when choosing between these two links, and the SVG deliberately
  // declares none, which is read as "scalable, any size". A single `32x32` here
  // is the widely-deployed form and is left alone on purpose: the file itself
  // carries 16/32/48/128, and declaring that whole set instead hands Chrome's
  // size-matching a large concrete raster to prefer over the SVG — which would
  // cost the dark-mode adaptation that is the only reason to link the SVG at
  // all, silently, with every gate still green. Narrow it, do not widen it.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? undefined;
  // Rendering surface, classified per-request in proxy.ts. Drives the fork-owned
  // app/brand-theme.css (empty in vanilla Sunrise). On <html> so body-portaled
  // overlays inherit it; kept current across client nav by <SurfaceSync> below.
  const surface = headersList.get('x-surface') ?? DEFAULT_SURFACE;

  return (
    <html lang="en" data-surface={surface} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const stored = localStorage.getItem('theme');
                  if (stored === 'light' || stored === 'dark') {
                    document.documentElement.classList.add(stored);
                  } else {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    const theme = prefersDark ? 'dark' : 'light';
                    document.documentElement.classList.add(theme);
                    localStorage.setItem('theme', theme);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <SurfaceSync />
        <ErrorHandlingProvider>
          <ConsentProvider>
            <AnalyticsProvider>
              <ThemeProvider>
                {children}
                <CookieBanner />
              </ThemeProvider>
              <Suspense fallback={null}>
                <UserIdentifier />
                <PageTracker skipInitial />
              </Suspense>
              <AnalyticsScripts nonce={nonce} />
            </AnalyticsProvider>
          </ConsentProvider>
        </ErrorHandlingProvider>
      </body>
    </html>
  );
}
