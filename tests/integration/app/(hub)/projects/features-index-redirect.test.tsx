/**
 * Integration: `/projects/[id]/features` index → redirects to the project.
 * @see app/(hub)/projects/[id]/features/page.tsx
 *
 * Keeps the feature-page breadcrumb's intermediate "Features" crumb a live link.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const navMock = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock('next/navigation', () => ({ redirect: navMock.redirect }));

import FeaturesIndexPage from '@/app/(hub)/projects/[id]/features/page';

beforeEach(() => vi.clearAllMocks());

describe('FeaturesIndexPage', () => {
  it('redirects to the parent project', async () => {
    await expect(FeaturesIndexPage({ params: Promise.resolve({ id: 'p1' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/projects/p1'
    );
    expect(navMock.redirect).toHaveBeenCalledWith('/projects/p1');
  });
});
