import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ prisma: { user: { findMany: vi.fn() } } }));

const { prisma } = await import('@/lib/db/client');
const { fetchUsers } = await import('@/lib/projects/user-refs');
const findMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('fetchUsers', () => {
  it('returns a Map keyed by id, de-duping the input ids', async () => {
    findMany.mockResolvedValue([{ id: 'u1', name: 'Ada', email: 'a@x.io', image: null }]);
    const map = await fetchUsers(['u1', 'u1']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['u1'] } } })
    );
    expect(map.get('u1')?.name).toBe('Ada');
  });

  it('skips the query and returns an empty Map for no ids', async () => {
    const map = await fetchUsers([]);
    expect(map.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('omits ids with no surviving user row', async () => {
    findMany.mockResolvedValue([]);
    const map = await fetchUsers(['gone']);
    expect(map.get('gone')).toBeUndefined();
  });
});
