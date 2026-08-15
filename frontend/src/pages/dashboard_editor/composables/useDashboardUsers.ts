/**
 * useDashboardUsers — the shared users list of the legacy editor
 * (dashboard_editor.html:2644-2647, the `allUsers` page-global).
 *
 * Legacy init fetched /dashboard/users once, filtered out ALL, and let every
 * widget's makeUsersDropdown read the same array. In Vue the list lives in a
 * module-level ref (page-global, like the store singleton) so D-editor-4..7
 * widgets import the same list the shell loaded at init.
 *
 * Error semantics preserved: a non-ok response or a network failure clears
 * the list and init continues (legacy `.catch(function () { allUsers = [] })`
 * never aborts the page).
 */
import { ref, type Ref } from 'vue';

export interface DashboardUsersController {
  /** Legacy allUsers — ['ALL'] filtered out. */
  users: Ref<string[]>;
  /** Legacy init step 1: fetch and filter; failures clear the list. */
  loadUsers(apiBase: string): Promise<void>;
}

const users = ref<string[]>([]);

export function useDashboardUsers(options?: {
  /** Injectable fetch (tests); defaults to the global fetch. */
  fetchFn?: typeof fetch;
}): DashboardUsersController {
  const fetchFn = options?.fetchFn ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function loadUsers(apiBase: string): Promise<void> {
    try {
      const r = await fetchFn(apiBase + '/dashboard/users');
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { users?: unknown };
      users.value = ((d.users ?? []) as string[]).filter((u) => u !== 'ALL');
    } catch {
      users.value = []; // legacy .catch(() => { allUsers = [] })
    }
  }

  return { users, loadUsers };
}
