import type { MetadataRoute } from 'next';

/**
 * Sitemap Configuration
 *
 * Generates a sitemap for search engine discovery.
 * Lists all public pages with their last modified dates and change frequencies.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 *
 * Phase 3.5: Landing Page & Marketing
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Public pages - add new public pages here.
  // HCE Hub (fork) is auth-only: the marketing landing (`''`, now a redirect to
  // the app) and `/about` (deleted) are not public content, so only the retained
  // legal + contact pages are listed. See .context/app/platform-divergences.md.
  const publicPages = [
    { path: '/contact', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
  ];

  return publicPages.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
