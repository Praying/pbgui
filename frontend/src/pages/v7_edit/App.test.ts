import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/*
 * Page-shell integration — the v7_edit twin of the v7_run / strategy
 * explorer dual-flavour tests. Both serving routes mount the SAME build; the
 * flavour comes from location.pathname (legacy runEditorAdapter was built
 * from the injected RUN_VERSION, v7_edit.html:1230-1232).
 *
 * M-v7-1 scope: scaffold + structured form + save round-trip. The handoff
 * buttons, coin-override panel, import/copy modals, log panel and the raw
 * JSON bidirectional sync land in M-v7-2.
 */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: 'v1.99', serial: 'S9' })),
}));

const fetchMock = vi.fn();

const USERS = { users: [{ name: 'alice', exchange: 'binance' }, { name: 'bob', exchange: 'bybit' }] };

const V7_INSTANCE_CONFIG = {
  config: {
    live: {
      user: 'alice',
      leverage: 20,
      approved_coins: { long: ['BTC'], short: [] },
      ignored_coins: { long: [], short: [] },
    },
    logging: { level: 1 },
    pbgui: { version: 3, enabled_on: 'disabled', note: 'hello' },
    bot: {
      long: { n_positions: 5, total_wallet_exposure_limit: 2.0 },
      short: { n_positions: 0, total_wallet_exposure_limit: 0 },
    },
    coin_overrides: {},
  },
  param_status: {},
  override_configs: {},
};

const V8_METADATA = {
  strategies: ['neat', 'recursive_mc'],
  strategy_defaults: {},
  params: {
    live: { leverage: {}, margin_mode_preference: {}, recv_window_ms: {}, startup_phase_budgets: {} },
    logging: { level: {} },
    monitor: {},
  },
};

const V8_INSTANCE_CONFIG = {
  config: {
    live: {
      user: 'alice',
      strategy_kind: 'neat',
      approved_coins: { long: [], short: [] },
      ignored_coins: { long: [], short: [] },
      leverage: 12,
    },
    logging: { level: 1, memory_snapshot_interval_minutes: 30 },
    pbgui: { version: 4, enabled_on: 'disabled' },
    bot: {
      long: { strategy: { neat: { grids: 4 } }, risk: { n_positions: 5, total_wallet_exposure_limit: 2 } },
      short: { strategy: { neat: {} }, risk: { n_positions: 0, total_wallet_exposure_limit: 0 } },
    },
    coin_overrides: {},
  },
  param_status: {},
  override_configs: {},
};

const HOSTS = {
  request_id: 'ignored-matching-later',
  hosts: ['hostA', 'hostB'],
  host_capabilities: { hostA: { pb7_capable: true, pb8_capable: false }, hostB: { pb8_capable: true } },
};

function stubFetch(opts: { flavor?: 'v7' | 'v8'; saveVersion?: number } = {}): void {
  const flavor = opts.flavor ?? 'v7';
  const saveVersion = opts.saveVersion ?? 9;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (u.includes('/editor/metadata') && flavor === 'v8')
      return Promise.resolve(new Response(JSON.stringify(V8_METADATA), { status: 200 }));
    if (u.includes('/users')) return Promise.resolve(new Response(JSON.stringify(USERS), { status: 200 }));
    if (u.includes('/instances/alice/config') && method === 'PUT')
      return Promise.resolve(
        new Response(
          JSON.stringify({ config: V7_INSTANCE_CONFIG.config, version: saveVersion, sync: { ok: 1, failed: 0 } }),
          { status: 200 }
        )
      );
    if (u.includes('/instances/alice/config'))
      return Promise.resolve(
        new Response(JSON.stringify(flavor === 'v8' ? V8_INSTANCE_CONFIG : V7_INSTANCE_CONFIG), { status: 200 })
      );
    if (u.includes('/symbols?')) return Promise.resolve(new Response(JSON.stringify({ symbols: ['BTC', 'ETH'], catalog: [] }), { status: 200 }));
    if (u.includes('/tags?')) return Promise.resolve(new Response(JSON.stringify({ tags: ['DeFi'] }), { status: 200 }));
    if (u.includes('/coins/status')) return Promise.resolve(new Response(JSON.stringify({ statuses: {} }), { status: 200 }));
    if (u.includes('/hosts')) {
      const requestId = new URL(u, 'http://pbgui.test:8000').searchParams.get('request_id') ?? '';
      return Promise.resolve(new Response(JSON.stringify({ ...HOSTS, request_id: requestId }), { status: 200 }));
    }
    if (u.includes('/override-params')) return Promise.resolve(new Response(JSON.stringify({ params: { bot: { long: {}, short: {} }, live: {} } }), { status: 200 }));
    if (u.includes('/notify_log')) return Promise.resolve(new Response('{}', { status: 200 }));
    throw new Error('unexpected fetch: ' + method + ' ' + u);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mountApp(path: string): Promise<ReturnType<typeof mount>> {
  window.history.replaceState({}, '', path);
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.title = '';
});

describe('Edit page shell (v7 flavour)', () => {
  it('boots the named instance, populates the form and gates hosts', async () => {
    stubFetch();
    const wrapper = await mountApp('/api/v7/edit_page?name=alice');

    expect(document.title).toBe('PBv7 Edit');
    // user dropdown from /users
    const userOptions = wrapper.findAll('#f-user option');
    expect(userOptions.map((o) => o.attributes('value'))).toEqual(['alice', 'bob']);
    expect((wrapper.get('#f-user').element as HTMLSelectElement).value).toBe('alice');
    // structured form values from the instance config
    expect((wrapper.get('#f-leverage').element as HTMLInputElement).value).toBe('20');
    expect((wrapper.get('#f-note').element as HTMLInputElement).value).toBe('hello');
    expect((wrapper.get('#f-long-twe').element as HTMLInputElement).value).toBe('2');
    expect((wrapper.get('#f-version').element as HTMLInputElement).value).toBe('3');
    // host list with capability gating (hostA pb7-capable, hostB not)
    const hostOptions = wrapper.findAll('#f-enabled-on option');
    expect(hostOptions.map((o) => o.attributes('value'))).toEqual(['disabled', 'hostA', 'hostB']);
    expect(hostOptions[1]!.attributes('disabled')).toBeUndefined();
    expect(hostOptions[2]!.attributes('disabled')).toBeDefined();
    expect(hostOptions[2]!.text()).toContain('PB7 capability unconfirmed');
    // approved long multiselect shows the fetched symbols with all
    expect(wrapper.get('#ms-approved-long').text()).toContain('all');
    wrapper.unmount();
  });

  it('saves the collected config via PUT and applies the new version (saveConfig :2908-2982)', async () => {
    stubFetch({ saveVersion: 11 });
    const wrapper = await mountApp('/api/v7/edit_page?name=alice');

    await wrapper.get('#f-note').setValue('edited note');
    await wrapper.get('#btn-save').trigger('click');
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));

    const put = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/instances/alice/config') && (c[1]?.method ?? 'GET') === 'PUT'
    )!;
    expect(put).toBeDefined();
    const body = JSON.parse(String(put[1]!.body)) as { config: Record<string, Record<string, unknown>> };
    expect(body.config.pbgui!.note).toBe('edited note');
    expect(body.config.live!.user).toBe('alice');
    expect(body.config.live!.leverage).toBe(20);
    expect(body.config.bot!.long).toMatchObject({ n_positions: 5, total_wallet_exposure_limit: 2 });
    expect(body.config.pbgui!.version).toBe(3);
    // version input refreshes from the save response
    expect((wrapper.get('#f-version').element as HTMLInputElement).value).toBe('11');
    expect(wrapper.get('#toast').attributes('style')).toContain('block');
    wrapper.unmount();
  });
});

describe('Edit page shell (v8 flavour)', () => {
  it('applies the metadata-driven visibility and strategy list', async () => {
    stubFetch({ flavor: 'v8' });
    const wrapper = await mountApp('/api/v8/edit_page?name=alice');

    expect(document.title).toBe('PBv8 Edit');
    // strategy kinds from /editor/metadata (legacy appends only, :1809-1813)
    const strategyOptions = wrapper.findAll('#f-strategy-kind option');
    expect(strategyOptions.map((o) => o.attributes('value'))).toEqual(['neat', 'recursive_mc']);
    expect((wrapper.get('#f-strategy-kind').element as HTMLSelectElement).value).toBe('neat');
    // open the Advanced expander so its fields are addressable (:672-676)
    await wrapper.get('#exp-advanced .expander-header').trigger('click');
    // managed live fields visible, unmanaged shared fields hidden
    expect(wrapper.find('#f-leverage').isVisible()).toBe(true);
    expect(wrapper.find('#f-recv-window').isVisible()).toBe(true);
    expect(wrapper.find('#f-startup-phase-budgets').isVisible()).toBe(true);
    expect(wrapper.find('#f-min-coin-age').isVisible()).toBe(false);
    expect(wrapper.find('#f-market-snapshot-strategy').isVisible()).toBe(false);
    // bot JSON carries the extracted strategy block + risk.* params
    expect(JSON.parse((wrapper.get('#f-long-json').element as HTMLTextAreaElement).value)).toEqual({
      strategy: { neat: { grids: 4 } },
      risk: { n_positions: 5, total_wallet_exposure_limit: 2 },
    });
    wrapper.unmount();
  });

  it('saves with the v8 body shape (expected_version + override_configs)', async () => {
    stubFetch({ flavor: 'v8' });
    const wrapper = await mountApp('/api/v8/edit_page?name=alice');

    await wrapper.get('#btn-save').trigger('click');
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));

    const put = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/instances/alice/config') && (c[1]?.method ?? 'GET') === 'PUT'
    )!;
    expect(String(put[0])).toBe('http://pbgui.test:8000/api/v8/instances/alice/config');
    expect(String(put[1]!.method)).toBe('PUT');
    const body = JSON.parse(String(put[1]!.body)) as {
      config: { live: Record<string, unknown>; pbgui: Record<string, unknown> };
      expected_version: number;
      override_configs: Record<string, unknown>;
    };
    expect(body.expected_version).toBe(4);
    expect(body.override_configs).toEqual({});
    expect(body.config.live.strategy_kind).toBe('neat');
    expect(body.config.live.leverage).toBe(12);
    expect(body.config.pbgui.runtime).toBe('pb8');
    wrapper.unmount();
  });
});

describe('Edit page completion (M-v7-2)', () => {
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  it('ACCEPTANCE (handoff 5): coin_overrides raw-JSON edits flow through collect', async () => {
    stubFetch();
    const base = JSON.parse(JSON.stringify(V7_INSTANCE_CONFIG)) as typeof V7_INSTANCE_CONFIG;
    base.config.coin_overrides = { BTCUSDT: { live: { leverage: 5 } } };
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = (init && init.method) || 'GET';
      if (u.includes('/users')) return Promise.resolve(new Response(JSON.stringify(USERS), { status: 200 }));
      if (u.includes('/instances/alice/config') && method === 'PUT')
        return Promise.resolve(new Response(JSON.stringify({ config: base.config, version: 12, sync: { ok: 0, failed: 0 } }), { status: 200 }));
      if (u.includes('/instances/alice/config')) return Promise.resolve(new Response(JSON.stringify(base), { status: 200 }));
      if (u.includes('/symbols?')) return Promise.resolve(new Response(JSON.stringify({ symbols: ['BTC'], catalog: [] }), { status: 200 }));
      if (u.includes('/tags?')) return Promise.resolve(new Response(JSON.stringify({ tags: [] }), { status: 200 }));
      if (u.includes('/coins/status')) return Promise.resolve(new Response(JSON.stringify({ statuses: {} }), { status: 200 }));
      if (u.includes('/hosts')) {
        const requestId = new URL(u, 'http://pbgui.test:8000').searchParams.get('request_id') ?? '';
        return Promise.resolve(new Response(JSON.stringify({ ...HOSTS, request_id: requestId }), { status: 200 }));
      }
      if (u.includes('/notify_log') || u.includes('/override-params')) return Promise.resolve(new Response('{}', { status: 200 }));
      throw new Error('unexpected fetch: ' + method + ' ' + u);
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountApp('/api/v7/edit_page?name=alice');

    // panel loaded the normalized override from the config
    expect(wrapper.text()).toContain('Coin Overrides');
    expect(wrapper.get('#exp-coin-ov').text()).toContain('BTC');

    // edit coin_overrides through the RAW JSON editor (the acceptance path)
    const raw = JSON.parse((wrapper.get('#cfg-raw-json').element as HTMLTextAreaElement).value) as {
      coin_overrides: Record<string, { live: { leverage: number } }>;
    };
    raw.coin_overrides = {
      BTCUSDT: { live: { leverage: 9 } },
      ETHUSDT: { live: { leverage: 3 } },
    };
    await wrapper.get('#cfg-raw-json').setValue(JSON.stringify(raw, null, 2));
    await sleep(320); // raw sync debounce (250 ms) + populate

    // the panel reloaded from the parsed config (coinOvLoad :2452)
    expect(wrapper.get('#exp-coin-ov').text()).toContain('ETH');

    await wrapper.get('#btn-save').trigger('click');
    await sleep(50);
    const put = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/instances/alice/config') && (c[1]?.method ?? 'GET') === 'PUT'
    )!;
    expect(put).toBeDefined();
    const body = JSON.parse(String(put[1]!.body)) as { config: { coin_overrides: Record<string, unknown> } };
    // collect reads the panel state the raw edit produced (ACCEPTANCE)
    expect(body.config.coin_overrides).toEqual({
      BTC: { live: { leverage: 9 } },
      ETH: { live: { leverage: 3 } },
    });
    wrapper.unmount();
  });

  it('handoff 3: 409 "Update your VPS first" opens the alert dialog, not a toast', async () => {
    stubFetch();
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const method = (init && init.method) || 'GET';
      if (u.includes('/users')) return Promise.resolve(new Response(JSON.stringify(USERS), { status: 200 }));
      if (u.includes('/instances/alice/config') && method === 'PUT')
        return Promise.resolve(new Response(JSON.stringify({ detail: 'Update your VPS first: PB7 runtime too old' }), { status: 409 }));
      if (u.includes('/instances/alice/config')) return Promise.resolve(new Response(JSON.stringify(V7_INSTANCE_CONFIG), { status: 200 }));
      if (u.includes('/symbols?')) return Promise.resolve(new Response(JSON.stringify({ symbols: [], catalog: [] }), { status: 200 }));
      if (u.includes('/tags?')) return Promise.resolve(new Response(JSON.stringify({ tags: [] }), { status: 200 }));
      if (u.includes('/coins/status')) return Promise.resolve(new Response(JSON.stringify({ statuses: {} }), { status: 200 }));
      if (u.includes('/hosts')) {
        const requestId = new URL(u, 'http://pbgui.test:8000').searchParams.get('request_id') ?? '';
        return Promise.resolve(new Response(JSON.stringify({ ...HOSTS, request_id: requestId }), { status: 200 }));
      }
      if (u.includes('/notify_log') || u.includes('/override-params')) return Promise.resolve(new Response('{}', { status: 200 }));
      throw new Error('unexpected fetch: ' + method + ' ' + u);
    });
    vi.stubGlobal('fetch', fetchMock);
    const alertSpy = vi.fn();
    (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs = { alert: alertSpy };
    const wrapper = await mountApp('/api/v7/edit_page?name=alice');

    await wrapper.get('#btn-save').trigger('click');
    await sleep(50);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith({
      title: 'Save blocked',
      message: 'Update your VPS first: PB7 runtime too old',
      confirmText: 'OK',
    });
    delete (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs;
    wrapper.unmount();
  });

  it('handoffs 1+2: v8 locks the version input and renames the managed distance label', async () => {
    const metadata: typeof V8_METADATA = JSON.parse(JSON.stringify(V8_METADATA));
    const live = metadata.params!.live as Record<string, unknown>;
    live.limit_order_create_max_market_dist_pct = {};
    live.max_n_cancellations_per_batch = {};
    live.max_n_creations_per_batch = {};
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/editor/metadata')) return Promise.resolve(new Response(JSON.stringify(metadata), { status: 200 }));
      if (u.includes('/users')) return Promise.resolve(new Response(JSON.stringify(USERS), { status: 200 }));
      if (u.includes('/instances/alice/config')) return Promise.resolve(new Response(JSON.stringify(V8_INSTANCE_CONFIG), { status: 200 }));
      if (u.includes('/symbols?')) return Promise.resolve(new Response(JSON.stringify({ symbols: [], catalog: [] }), { status: 200 }));
      if (u.includes('/tags?')) return Promise.resolve(new Response(JSON.stringify({ tags: [] }), { status: 200 }));
      if (u.includes('/coins/status')) return Promise.resolve(new Response(JSON.stringify({ statuses: {} }), { status: 200 }));
      if (u.includes('/hosts')) {
        const requestId = new URL(u, 'http://pbgui.test:8000').searchParams.get('request_id') ?? '';
        return Promise.resolve(new Response(JSON.stringify({ ...HOSTS, request_id: requestId }), { status: 200 }));
      }
      if (u.includes('/override-params') || u.includes('/notify_log')) return Promise.resolve(new Response('{}', { status: 200 }));
      throw new Error('unexpected fetch: ' + u);
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountApp('/api/v8/edit_page?name=alice');

    // handoff 1: version input readonly (expected_version lock token)
    expect((wrapper.get('#f-version').element as HTMLInputElement).readOnly).toBe(true);
    // handoff 2: f-price-dist label renamed for the managed limit key
    expect(wrapper.get('#f-price-dist').element.parentElement!.textContent).toContain('limit_order_create_max_market_dist_pct');
    wrapper.unmount();
  });

  it('handoff 4: unknown users/strategies from the config stay selectable after populate', async () => {
    fetchMock.mockReset();
    const config = JSON.parse(JSON.stringify(V8_INSTANCE_CONFIG)) as typeof V8_INSTANCE_CONFIG;
    config.config.live = { ...config.config.live, user: 'carol', strategy_kind: 'exotic' };
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/editor/metadata')) return Promise.resolve(new Response(JSON.stringify(V8_METADATA), { status: 200 }));
      if (u.includes('/users')) return Promise.resolve(new Response(JSON.stringify(USERS), { status: 200 }));
      if (u.includes('/instances/alice/config')) return Promise.resolve(new Response(JSON.stringify({ ...config, param_status: {}, override_configs: {} }), { status: 200 }));
      if (u.includes('/symbols?')) return Promise.resolve(new Response(JSON.stringify({ symbols: [], catalog: [] }), { status: 200 }));
      if (u.includes('/tags?')) return Promise.resolve(new Response(JSON.stringify({ tags: [] }), { status: 200 }));
      if (u.includes('/coins/status')) return Promise.resolve(new Response(JSON.stringify({ statuses: {} }), { status: 200 }));
      if (u.includes('/hosts')) {
        const requestId = new URL(u, 'http://pbgui.test:8000').searchParams.get('request_id') ?? '';
        return Promise.resolve(new Response(JSON.stringify({ ...HOSTS, request_id: requestId }), { status: 200 }));
      }
      if (u.includes('/override-params') || u.includes('/notify_log')) return Promise.resolve(new Response('{}', { status: 200 }));
      throw new Error('unexpected fetch: ' + u);
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountApp('/api/v8/edit_page?name=alice');

    // ensureSelectOption parity (:2336/:2338) — now AFTER populate (dead-branch fix)
    expect(wrapper.findAll('#f-user option').map((o) => o.attributes('value'))).toContain('carol');
    expect((wrapper.get('#f-user').element as HTMLSelectElement).value).toBe('carol');
    expect(wrapper.findAll('#f-strategy-kind option').map((o) => o.attributes('value'))).toEqual(
      expect.arrayContaining(['exotic', 'neat', 'recursive_mc'])
    );
    expect((wrapper.get('#f-strategy-kind').element as HTMLSelectElement).value).toBe('exotic');
    wrapper.unmount();
  });
});

describe('PB8 replace-and-save confirmation (v1.98.33)', () => {
  const typePut = (c: unknown): boolean =>
    String((c as unknown[])[0]).includes('/instances/alice/config')
    && ((c as unknown[])[1] as RequestInit | undefined)?.method === 'PUT';

  it('confirms before replacing an existing instance and saves against its version', async () => {
    stubFetch({ flavor: 'v8' });
    const confirm = vi.fn().mockResolvedValue(true);
    (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs = { confirm };

    const wrapper = await mountApp('/api/v8/edit_page?new=1');
    await wrapper.get('#f-user').setValue('alice');
    await wrapper.get('#btn-save').trigger('click');
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));

    expect(confirm).toHaveBeenCalledTimes(1);
    const options = confirm.mock.calls[0]![0] as { title: string; message: string; confirmText: string };
    expect(options.title).toBe('Replace existing PB8 instance?');
    expect(options.message).toContain('alice');
    expect(options.message).toContain('v4');
    expect(options.confirmText).toBe('Replace and Save');

    const put = fetchMock.mock.calls.find(typePut)!;
    expect(String(put[0])).not.toContain('create_only');
    const body = JSON.parse(String(put[1]!.body)) as { expected_version: number };
    expect(body.expected_version).toBe(4);
    delete (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs;
    wrapper.unmount();
  });

  it('cancels the replace without sending a PUT', async () => {
    stubFetch({ flavor: 'v8' });
    const confirm = vi.fn().mockResolvedValue(false);
    (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs = { confirm };

    const wrapper = await mountApp('/api/v8/edit_page?new=1');
    await wrapper.get('#f-user').setValue('alice');
    await wrapper.get('#btn-save').trigger('click');
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.find(typePut)).toBeUndefined();
    delete (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs;
    wrapper.unmount();
  });

  it('keeps create_only when the target name is free', async () => {
    stubFetch({ flavor: 'v8' });
    const baseImpl = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
      if (String(url).includes('/instances/alice/config') && (init?.method ?? 'GET') === 'GET')
        return Promise.resolve(new Response(JSON.stringify({ detail: 'not found' }), { status: 404 }));
      return baseImpl(url, init);
    });
    const confirm = vi.fn().mockResolvedValue(true);
    (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs = { confirm };

    const wrapper = await mountApp('/api/v8/edit_page?new=1');
    await wrapper.get('#f-user').setValue('alice');
    await wrapper.get('#btn-save').trigger('click');
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));

    expect(confirm).not.toHaveBeenCalled();
    const put = fetchMock.mock.calls.find(typePut)!;
    expect(String(put[0])).toContain('create_only=true');
    delete (window as typeof window & { PBGuiDialogs?: unknown }).PBGuiDialogs;
    wrapper.unmount();
  });
});
