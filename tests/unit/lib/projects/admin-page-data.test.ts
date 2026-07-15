import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/api/server-fetch', () => ({
  serverFetch: vi.fn(),
  parseApiResponse: vi.fn(),
}));

import { serverFetch, parseApiResponse } from '@/lib/api/server-fetch';
import { getSelectableUsers, getProjectDetail } from '@/lib/projects/admin-page-data';

const fetchMock = serverFetch as ReturnType<typeof vi.fn>;
const parseMock = parseApiResponse as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('getSelectableUsers', () => {
  it('maps the user list and defaults image to null', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({
      success: true,
      data: [{ id: 'u1', name: 'Ada', email: 'ada@x.io' }],
    });
    const users = await getSelectableUsers();
    expect(users).toEqual([{ id: 'u1', name: 'Ada', email: 'ada@x.io', image: null }]);
  });

  it('returns [] when the fetch is not ok, the API reports failure, or it throws', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await getSelectableUsers()).toEqual([]);

    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: false });
    expect(await getSelectableUsers()).toEqual([]);

    fetchMock.mockRejectedValue(new Error('boom'));
    expect(await getSelectableUsers()).toEqual([]);
  });
});

describe('getProjectDetail', () => {
  it('returns the project on success', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: true, data: { id: 'p1', name: 'Hub' } });
    const project = await getProjectDetail('p1');
    expect(project?.id).toBe('p1');
  });

  it('returns null on a 404 (expected) and on a non-404 failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect(await getProjectDetail('missing')).toBeNull();

    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await getProjectDetail('boom')).toBeNull();
  });

  it('returns null when the API reports failure', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    parseMock.mockResolvedValue({ success: false });
    expect(await getProjectDetail('p1')).toBeNull();
  });
});
