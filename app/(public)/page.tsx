import { redirect } from 'next/navigation';

/**
 * Root route — HCE Hub is an internal, auth-only app.
 *
 * There is no public marketing landing (HCE Studio's public site lives at
 * hce.studio, a separate deployment — see v1-requirements §13.1). `/` bounces
 * into the app; the proxy then redirects signed-out visitors on to `/login`.
 * `f-shell` later reclaims `/` as the real protected Hub home.
 *
 * app:shim — fork-owned redirect replacing Sunrise's marketing landing; keep
 * this on upstream merges (see .context/app/platform-divergences.md).
 */
export default function RootPage() {
  redirect('/dashboard');
}
