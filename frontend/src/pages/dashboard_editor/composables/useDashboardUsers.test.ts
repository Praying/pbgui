import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardUsers } from './useDashboardUsers';

/* Port of the init users load (dashboard_editor.html:2644-2647): allUsers is
   fetched once at startup, ALL is filtered out, and any failure produces an
   empty list while init continues (the .catch clears and resolves). */

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useDashboardUsers', () => {
  it('fetches /dashboard/users and filters ALL out', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: ['ALL', 'alice', 'bob'] }));
    const { users, loadUsers } = useDashboardUsers({ fetchFn: fetchMock });

    await loadUsers('/api');

    expect(fetchMock).toHaveBeenCalledWith('/api/dashboard/users');
    expect(users.value).toEqual(['alice', 'bob']);
  });

  it('shares the loaded list across useDashboardUsers callers (legacy page-global allUsers)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: ['ALL', 'a'] }));
    const first = useDashboardUsers({ fetchFn: fetchMock });
    await first.loadUsers('/api');

    const second = useDashboardUsers();
    expect(second.users.value).toEqual(['a']);
  });

  it('clears the list on a non-ok response (legacy throw → catch → [])', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: ['x'] }, false));
    const { users, loadUsers } = useDashboardUsers({ fetchFn: fetchMock });
    await loadUsers('/api');
    expect(users.value).toEqual([]);
  });

  it('clears the list on a network failure and keeps init going', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const { users, loadUsers } = useDashboardUsers({ fetchFn: fetchMock });
    await expect(loadUsers('/api')).resolves.toBeUndefined();
    expect(users.value).toEqual([]);
  });

  it('clears the list when the payload has no users array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    const { users, loadUsers } = useDashboardUsers({ fetchFn: fetchMock });
    await loadUsers('/api');
    expect(users.value).toEqual([]);
  });

  it('handles a missing users key without ALL', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: ['u1', 'u2'] }));
    const { users, loadUsers } = useDashboardUsers({ fetchFn: fetchMock });
    await loadUsers('/api');
    expect(users.value).toEqual(['u1', 'u2']);
  });
});
