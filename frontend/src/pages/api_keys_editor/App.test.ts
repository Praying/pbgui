import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/* Page-shell integration for the API Keys editor (Vue port of
   frontend/api_keys_editor.html). Provenance-anchored: table render
   :1309-1427, edit flow :1493-1604, save :1822-1954, delete :1956-1988,
   dirty guard :1789-1819, hash deep links :1185-1212. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

const EXCHANGES = {
  exchanges: ['binance', 'bybit', 'hyperliquid', 'okx'],
  passphrase_exchanges: ['okx'],
  v7_exchanges: ['binance'],
};

const USERS = [
  { name: 'alice', exchange: 'binance', in_use: true, has_key: true, has_secret: true },
  { name: 'bob', exchange: 'bybit', in_use: false, has_key: true, has_secret: true, bybit_expiry_status: 'ok', bybit_days_remaining: 5, bybit_expires_at_iso: '2026-09-01T00:00:00' },
  { name: 'hl1', exchange: 'hyperliquid', in_use: false, has_wallet: true, has_private_key: true, is_vault: true, hl_expiry_status: 'expiring_soon', hl_days_remaining: 3, hl_valid_until_iso: '2026-08-20T00:00:00' },
];

const BOB_DETAIL = {
  name: 'bob', exchange: 'bybit', in_use: false, has_key: true, has_secret: true,
  key_masked: 'xx', secret_masked: 'yy', passphrase_masked: '', private_key_masked: '',
  wallet_address: '', quote: '', options: null, extra: null,
  bybit_expiry_status: 'ok', bybit_days_remaining: 5, bybit_expires_at_iso: '2026-09-01T00:00:00',
};

const TRADFI_PROFILES = {
  providers: ['alpaca', 'polygon'],
  provider_notes: { alpaca: 'Alpaca note', polygon: 'Polygon note' },
  provider_links: { alpaca: { url: 'https://app.alpaca.markets/x', label: 'Get free Alpaca API key' } },
  needs_secret: ['alpaca'],
  profiles: [
    { id: 'p1', provider: 'alpaca', label: 'main', active: true, shared: true, generation: 2, has_api_key: true, has_api_secret: true, origin: 'local', pending: false, pending_delete: false, pending_stage: '', pending_operation_id: '', last_operation_id: 'op-old', replicated_active: true, activation_generation: 2, updated_at: '2026-08-01T10:00:00' },
  ],
  replicated_active_profiles: { alpaca: { profile_id: 'p1' } },
  projection: { status: 'current', desired_generation: 2, applied_generation: 2, attempts: 1 },
};

type DialogsWindow = Window & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } };

function dialogsWindow(): DialogsWindow {
  return window as DialogsWindow;
}

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

function apiPath(url: string | URL): { path: string; method: string; body?: unknown } {
  const u = String(url);
  const path = u.replace('http://pbgui.test:8000/api/api-keys', '') || '/';
  return { path, method: 'GET' };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/api-keys/main_page');
  dialogsWindow().PBGuiDialogs = {
    confirm: vi.fn(async () => true),
  };
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const path = apiPath(url).path;
    const method = (init?.method as string) || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === '/exchanges') return Promise.resolve(new Response(JSON.stringify(EXCHANGES), { status: 200 }));
    if (path === '/meta') return Promise.resolve(new Response(JSON.stringify({ api_serial: 'SER-1', api_ts: '2026-08-15T10:00:00', api_by: 'admin' }), { status: 200 }));
    if (path === '/' && method === 'GET') return Promise.resolve(new Response(JSON.stringify(USERS), { status: 200 }));
    if (path === '/bob' && method === 'GET') return Promise.resolve(new Response(JSON.stringify(BOB_DETAIL), { status: 200 }));
    if (path === '/alice' && method === 'GET')
      return Promise.resolve(new Response(JSON.stringify({ ...BOB_DETAIL, name: 'alice', in_use: true }), { status: 200 }));
    if (path === '/alice' && method === 'DELETE') return Promise.resolve(new Response(JSON.stringify({ deleted: 'alice' }), { status: 200 }));
    if (path === '/' && method === 'POST') return Promise.resolve(new Response(JSON.stringify({ name: 'carol' }), { status: 200 }));
    if (path === '/bob/test') return Promise.resolve(new Response(JSON.stringify({ success: true, balance_futures: 12.5 }), { status: 200 }));
    if (path === '/tradfi/profiles') return Promise.resolve(new Response(JSON.stringify(TRADFI_PROFILES), { status: 200 }));
    if (path === '/tradfi/yfinance/status') return Promise.resolve(new Response(JSON.stringify({ installed: true, version: '0.2.40' }), { status: 200 }));
    if (path === '/comments/list') return Promise.resolve(new Response(JSON.stringify([{ key: '_comment_a', value: 'hello' }]), { status: 200 }));
    if (path === '/backups') return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    if (path === '/hl-expiry/config') return Promise.resolve(new Response(JSON.stringify({ telegram_warning_days: 7, configured: true }), { status: 200 }));
    if (String(url) === '/api/notify_log') return Promise.resolve(new Response('{}', { status: 200 }));
    void body;
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
// Registered AFTER the body-wipe hook: vitest runs afterEach LIFO, so the
// teleported Modal unmounts before the wipe destroys its portal anchors
// (removeFragment crash otherwise — see shared/testing notes).
enableAutoUnmount(afterEach);

function rowNames(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper
    .findAll('#userTableBody tr[data-user-name]')
    .map((row) => row.attributes('data-user-name') ?? '');
}

describe('API Keys page shell', () => {
  it('renders the user table with badges, counts and the meta bar (:1282-1427, :1266-1280)', async () => {
    const wrapper = await mountApp();

    expect(rowNames(wrapper)).toEqual(['alice', 'bob', 'hl1']);
    const aliceRow = wrapper.find('tr[data-user-name="alice"]');
    expect(aliceRow.text()).toContain('In Use');
    expect(wrapper.find('tr[data-user-name="bob"] .badge-expiry').text()).toContain('5d');
    expect(wrapper.find('tr[data-user-name="hl1"]').text()).toContain('wallet');
    expect(wrapper.find('tr[data-user-name="hl1"]').text()).toContain('vault');
    expect(wrapper.find('tr[data-user-name="alice"] .badge-exchange').classes()).toContain('text-accent-soft');
    expect(wrapper.find('tr[data-user-name="bob"] .badge-exchange').classes()).toContain('text-accent-soft');
    expect(wrapper.find('#sb-count').text()).toBe('3 users');
    expect(wrapper.find('#sb-inuse').text()).toBe('1 in use');
    expect(wrapper.find('#metaSerial').text()).toBe('SER-1');
    expect(wrapper.find('#metaBy').text()).toBe('by admin');
    // in-use users hide the Delete action (:1420-1422)
    expect(wrapper.find('tr[data-user-name="alice"] [data-user-action="delete"]').exists()).toBe(false);
    expect(wrapper.find('tr[data-user-name="bob"] [data-user-action="delete"]').exists()).toBe(true);
  });

  it('filters by name/exchange and persists ?filter= in the URL (:1317-1322, :1131-1137)', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#userFilterClear').exists()).toBe(false);
    await wrapper.find('#userFilter').setValue('byb');
    expect(rowNames(wrapper)).toEqual(['bob']);
    expect(window.location.search).toContain('filter=byb');
    expect(wrapper.find('#userFilterClear').exists()).toBe(true);

    await wrapper.find('#userFilterClear').trigger('click');
    expect(wrapper.find('#userFilter').element).toBe(document.activeElement);
    expect(wrapper.find('#userFilterClear').exists()).toBe(false);

    await wrapper.find('#userFilter').setValue('zzz');
    expect(wrapper.text()).toContain('No users match the filter.');

    await wrapper.find('#userFilter').setValue('');
    expect(rowNames(wrapper)).toHaveLength(3);
  });

  it('sorts by name asc then desc and persists sort/dir (:1324-1353)', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#th-name .sort-icon').exists()).toBe(false);
    await wrapper.find('#th-name').trigger('click');
    expect(rowNames(wrapper)).toEqual(['alice', 'bob', 'hl1']);
    expect(window.location.search).toContain('sort=name');
    expect(window.location.search).toContain('dir=1');
    expect(wrapper.find('#th-name').attributes('aria-sort')).toBe('ascending');
    expect(wrapper.find('#th-name .sort-icon').exists()).toBe(true);
    expect(wrapper.find('#th-exchange .sort-icon').exists()).toBe(false);

    await wrapper.find('#th-name').trigger('click');
    expect(rowNames(wrapper)).toEqual(['hl1', 'bob', 'alice']);
    expect(window.location.search).toContain('dir=-1');
    expect(wrapper.find('#th-name').attributes('aria-sort')).toBe('descending');
  });

  it('opens the edit panel for a user with masked placeholders and delete (:1493-1604)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('tr[data-user-name="bob"] [data-user-action="edit"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('#editPanel').isVisible()).toBe(true);
    expect(wrapper.find('#userListView').isVisible()).toBe(false);
    expect(wrapper.find('#editPanelTitle').text()).toBe('Edit: bob');
    expect((wrapper.find('#editName').element as HTMLInputElement).value).toBe('bob');
    expect((wrapper.find('#editKey').element as HTMLInputElement).placeholder).toContain('(saved — leave blank to keep)');
    expect(wrapper.find('#btnDelete').isVisible()).toBe(true);
    // bybit edit mode shows the inline expiry block (:1585-1598)
    expect(wrapper.find('#bybitExpiryInline').isVisible()).toBe(true);
    expect(wrapper.find('#hlExpiryInline').isVisible()).toBe(false);

    await wrapper.find('#editPanel button.back-btn').trigger('click');
    await flushPromises();
    expect(wrapper.find('#userListView').isVisible()).toBe(true);
  });

  it('disables rename/exchange for in-use users (:1545-1551)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('tr[data-user-name="alice"]').trigger('click');
    await flushPromises();

    expect((wrapper.find('#editName').element as HTMLInputElement).disabled).toBe(true);
    expect((wrapper.find('#editExchange').element as HTMLSelectElement).disabled).toBe(true);
    expect(wrapper.find('#btnDelete').isVisible()).toBe(false);
  });

  it('validates required fields before create (:1822-1872)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('[data-testid="add-user"]').trigger('click');
    expect(wrapper.find('#editPanel').isVisible()).toBe(true);
    expect(wrapper.find('#editPanelTitle').text()).toBe('New User');
    expect(wrapper.find('[data-test="user-identity-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="user-credentials-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="user-advanced-section"]').exists()).toBe(true);
    expect(wrapper.find('.expander-toggle').attributes('aria-expanded')).toBe('false');

    await wrapper.find('#btnSave').trigger('click');
    await flushPromises();
    // The shared Modal portals to body — query document, not wrapper.
    expect(document.querySelector('#alertModalBody')?.textContent).toContain('Username is required');

    await wrapper.find('#editName').setValue('carol');
    await wrapper.find('#btnSave').trigger('click');
    await flushPromises();
    expect(document.querySelector('#alertModalBody')?.textContent).toContain('API Key is required');
  });

  it('saves a new user with the exact legacy payload (:1891-1914)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('[data-testid="add-user"]').trigger('click');
    await wrapper.find('#editName').setValue('carol');
    await wrapper.find('#editKey').setValue('k1');
    await wrapper.find('#editSecret').setValue('s1');
    await wrapper.find('#btnSave').trigger('click');
    await flushPromises();

    const create = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/api/api-keys/') && (i?.method ?? 'GET') === 'POST');
    expect(create).toBeTruthy();
    const body = JSON.parse(String(create![1]!.body));
    expect(body).toEqual({
      name: 'carol',
      data: {
        exchange: 'binance',
        key: 'k1',
        secret: 's1',
        passphrase: null,
        wallet_address: null,
        private_key: null,
        is_vault: false,
        quote: null,
        options: null,
        extra: null,
      },
    });
    // success toast (:1914)
    expect(wrapper.find('#toastContainer').text()).toContain('User created: carol');
  });

  it('sends a rename before the update when the username changed (:1916-1928)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('tr[data-user-name="bob"] [data-user-action="edit"]').trigger('click');
    await flushPromises();
    await wrapper.find('#editName').setValue('bobby');
    await wrapper.find('#btnSave').trigger('click');
    await flushPromises();

    const rename = fetchMock.mock.calls.find(([u, i]) => String(u).includes('/bob/rename') && i?.method === 'PATCH');
    expect(rename).toBeTruthy();
    expect(JSON.parse(String(rename![1]!.body))).toEqual({ new_name: 'bobby' });
    const update = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/api/api-keys/bobby') && i?.method === 'PUT');
    expect(update).toBeTruthy();
  });

  it('deletes a user after the confirm dialog (:1956-1988)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('tr[data-user-name="bob"] [data-user-action="delete"]').trigger('click');
    await flushPromises();

    expect(dialogsWindow().PBGuiDialogs!.confirm).toHaveBeenCalled();
    const del = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/bob') && i?.method === 'DELETE');
    expect(del).toBeTruthy();
    expect(wrapper.find('#toastContainer').text()).toContain('User deleted: bob');
  });

  it('blocks leaving a dirty new-user panel until confirmed (:1789-1819)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('[data-testid="add-user"]').trigger('click');
    await wrapper.find('#editName').setValue('carol'); // marks dirty
    await wrapper.find('#editPanel button.back-btn').trigger('click');
    await flushPromises();
    expect(dialogsWindow().PBGuiDialogs!.confirm).toHaveBeenCalledTimes(1);
    expect(dialogsWindow().PBGuiDialogs!.confirm).toHaveBeenCalledWith({
      title: 'Discard changes',
      message: 'You have unsaved changes. Leave without saving?',
      confirmText: 'Leave',
    });
    expect(wrapper.find('#editPanel').isVisible()).toBe(false); // confirmed → leaves
    expect(wrapper.find('#userListView').isVisible()).toBe(true);

    // re-open, dirty again, but decline this time
    dialogsWindow().PBGuiDialogs!.confirm.mockResolvedValueOnce(false);
    await wrapper.find('[data-testid="add-user"]').trigger('click');
    await wrapper.find('#editName').setValue('dana');
    await wrapper.find('#editPanel button.back-btn').trigger('click');
    await flushPromises();
    expect(wrapper.find('#editPanel').isVisible()).toBe(true); // stays
    expect(wrapper.find('#userListView').isVisible()).toBe(false);
  });

  it('tests the connection with unsaved overrides and shows the balance (:1991-2049)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('tr[data-user-name="bob"] [data-user-action="edit"]').trigger('click');
    await flushPromises();
    await wrapper.find('#editKey').setValue('fresh-key');
    await wrapper.find('#btnTest').trigger('click');
    await flushPromises();

    const test = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/bob/test') && i?.method === 'POST');
    expect(JSON.parse(String(test![1]!.body))).toEqual({ key: 'fresh-key' });
    expect(wrapper.find('#balanceDisplay').isVisible()).toBe(true);
    expect(wrapper.find('#balanceDisplay').text()).toContain('Futures Balance');
    expect(wrapper.find('#balanceDisplay').text()).toContain('12.50');
    expect(wrapper.find('#toastContainer').text()).toContain('Connection successful!');
  });

  it('deep-links into the TradFi panel via #tradfi and loads profiles (:1197-1199)', async () => {
    window.history.replaceState({}, '', '/api/api-keys/main_page#tradfi');
    const wrapper = await mountApp();

    expect(wrapper.find('#tradfiPanel').isVisible()).toBe(true);
    expect(wrapper.find('#userListView').isVisible()).toBe(false);
    expect(wrapper.find('#tradfiProfilesBody').text()).toContain('p1');
    expect(wrapper.find('#yfStatus').text()).toContain('0.2.40');
    // back clears the hash and returns to the list (:1812)
    await wrapper.find('#tradfiPanel button.back-btn').trigger('click');
    await flushPromises();
    expect(wrapper.find('#userListView').isVisible()).toBe(true);
    expect(window.location.hash).toBe('');
  });

  it('returns to the list on Escape when a panel is open (:1167-1177)', async () => {
    const wrapper = await mountApp();

    await wrapper.find('[data-testid="rail-section-comments"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('#commentsPanel').isVisible()).toBe(true);

    await document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(wrapper.find('#userListView').isVisible()).toBe(true);
  });

  it('renders rich empty state when no users are configured and allows adding a user', async () => {
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const path = apiPath(url).path;
      const method = (init?.method as string) || 'GET';
      if (path === '/exchanges') return Promise.resolve(new Response(JSON.stringify(EXCHANGES), { status: 200 }));
      if (path === '/meta') return Promise.resolve(new Response(JSON.stringify({ api_serial: 'SER-EMPTY', api_ts: null, api_by: null }), { status: 200 }));
      if (path === '/' && method === 'GET') return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      if (String(url) === '/api/notify_log') return Promise.resolve(new Response('{}', { status: 200 }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const wrapper = await mountApp();
    expect(wrapper.find('.empty-state-container').exists()).toBe(true);
    expect(wrapper.text()).toContain('No API Keys Configured');
    expect(wrapper.find('[data-testid="empty-add-user"]').exists()).toBe(true);

    await wrapper.find('[data-testid="empty-add-user"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('#editPanel').isVisible()).toBe(true);
  });
});
