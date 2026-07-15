import { describe, it, expect } from 'vitest';
import { PROJECT_ADMIN_API } from '@/lib/projects/admin-endpoints';

describe('PROJECT_ADMIN_API', () => {
  it('builds the collection + detail + member paths', () => {
    expect(PROJECT_ADMIN_API.list).toBe('/api/v1/admin/projects');
    expect(PROJECT_ADMIN_API.detail('p1')).toBe('/api/v1/admin/projects/p1');
    expect(PROJECT_ADMIN_API.members('p1')).toBe('/api/v1/admin/projects/p1/members');
    expect(PROJECT_ADMIN_API.member('p1', 'u9')).toBe('/api/v1/admin/projects/p1/members/u9');
  });

  it('encodes the member userId segment', () => {
    expect(PROJECT_ADMIN_API.member('p1', 'a b/c')).toBe(
      '/api/v1/admin/projects/p1/members/a%20b%2Fc'
    );
  });
});
