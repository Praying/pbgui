import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/* M-data-1 shell integration: sidebar registry → PanelShell switching with
   persistence (legacy setActivePanel/restorePanel :9032-9107, :9736-9773),
   the exchange context bar (:2965-2977).
   M-data-2: setContextExchange fan-out (:7304-7333, :9611-9613), status
   fragment mount (:3223-3227, :4102-4174), sidebar shortcut modes
   (:9112-9120, :7415-7446), refreshStatuses bootstrap (:9772), help opener
   (:4085-4089), data-tip tooltip (:3637).
   M-data-4: tiingo/tradfi cards through the settings payload hooks
   (:7379-7401), the vault 401 clear (:4924) and pagehide (:9734).
   M-data-7: best1m enter/fan-out refresh (:9058, :7321-7323) and the
   copy-data monitor mount + 15 s schedule poll gating (:9059-9064). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({
    token: 'tok',
    origin: 'http://pbgui.test:8000',
    version: '1.0.0',
    serial: 'S1',
  })),
}));

const LS_KEY_PANEL = 'market_data_fastapi_active_panel';
const LS_KEY_EXCHANGE = 'market_data_fastapi_context_exchange';

const BASE = 'http://pbgui.test:8000';

const SETTINGS_PAYLOAD = {
  exchange: 'hyperliquid',
  auto_enable_new_coins: false,
  enabled_coins: ['BTC'],
  coin_options: ['BTC', 'ETH', 'SOL'],
  missing_saved_coins: [],
  settings: {
    interval_seconds: 2700,
    coin_pause_seconds: 0.5,
    api_timeout_seconds: 30,
    min_lookback_days: 2,
    max_lookback_days: 4,
    aws_profile: 'pbgui-hyperliquid',
    aws_access_key_id: '',
    aws_secret_access_key: '',
    aws_region: 'us-east-1',
    l2book_scan_timeout_s: 5,
    l2book_scan_workers: 8,
    l2book_archive_enabled: false,
    l2book_archive_dir: '',
    tiingo_configured: true,
    tiingo_profile_id: 'p1',
    tiingo_usage: { hour_requests: 1, hour_limit: 4 },
  },
};

const TRADFI_MAP_PAYLOAD = {
  success: true,
  payload: {
    rows: [
      {
        xyz_coin: 'TSLA',
        canonical_type: 'equity_us',
        status: 'ok',
        tiingo_ticker: 'TSLA',
        hl_price: 250.5,
      },
    ],
    type_values: ['equity_us'],
    status_values: ['ok'],
    canonical_types: ['equity_us'],
    statuses: ['ok'],
    meta_cache_info: { summary: 'meta' },
    quote_cache_info: { summary: 'quote' },
    spec_cache_info: { summary: 'spec' },
  },
};

const BYBIT_SETTINGS_PAYLOAD = {
  exchange: 'bybit',
  auto_enable_new_coins: false,
  enabled_coins: ['BTC'],
  coin_options: ['BTC', 'ADA'],
  missing_saved_coins: [],
  settings: {
    interval_seconds: 900,
    coin_pause_seconds: 1,
    api_timeout_seconds: 20,
    min_lookback_days: 1,
    max_lookback_days: 3,
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountApp() {
  return mount(App, {
    global: { plugins: [createI18n('en')] },
    attachTo: document.body,
  });
}

function visiblePanelIds(wrapper: ReturnType<typeof mountApp>): string[] {
  return wrapper
    .findAll('section.content-panel')
    .filter((s) => s.attributes('hidden') === undefined)
    .map((s) => s.attributes('id') ?? '');
}

function statusMonitorSrcs(wrapper: ReturnType<typeof mountApp>): string[] {
  return [wrapper.find('#status-monitor-host').element as HTMLIFrameElement]
    .map((frame) => frame.src)
    .filter((src) => src.includes('/status-monitor/'));
}

/** Default backend mock — settings payloads are exchange-aware (:8885). */
function defaultFetchMock(url: string | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);
  if (u.includes('/tradfi-map')) {
    return Promise.resolve(new Response(JSON.stringify(TRADFI_MAP_PAYLOAD), { status: 200 }));
  }
  if (u.includes('/api/market-data/settings/')) {
    if (u.includes('/bybit')) {
      if (init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, message: 'Bybit settings saved.', settings: BYBIT_SETTINGS_PAYLOAD }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify(BYBIT_SETTINGS_PAYLOAD), { status: 200 }));
    }
    if (init?.method === 'POST') {
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, message: 'Hyperliquid settings saved.', settings: SETTINGS_PAYLOAD }),
          { status: 200 }
        )
      );
    }
    return Promise.resolve(new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 }));
  }
  return Promise.resolve(new Response('{"running":false}', { status: 200 }));
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(defaultFetchMock);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  delete window.PBGuiSharedHelp;
  delete window._openMarketDataHelp;
  delete window.PBGUI_HELP_OPENER;
  document.body.innerHTML = '';
});

describe('page skeleton (legacy DOM :2836, :2917-2977)', () => {
  it('renders the topnav placeholder, sidebar and main content', () => {
    const app = mountApp();
    expect(app.find('nav#topnav').exists()).toBe(true);
    expect(app.find('#page-body').exists()).toBe(true);
    expect(app.find('#sidebar').exists()).toBe(true);
    expect(app.find('#main-content').exists()).toBe(true);
    expect(app.find('.migration-watermark').exists()).toBe(true);
  });

  it('sets the document title from the legacy market.title key (:3646)', () => {
    mountApp();
    expect(document.title).toBe('Market Data - PBGui');
  });

  it('renders the sidebar section buttons with legacy labels in order (:2925-2949)', () => {
    const app = mountApp();
    const buttons = app.findAll('#sidebar-toolbar .sb-btn').map((b) => b.text());
    expect(buttons).toEqual([
      'Settings',
      'Status Monitor',
      'OHLCV Data',
      'OHLCV Integrity',
      // inventory context blocks (:2929-2945) — M-data-6; the four view
      // tabs render because hyperliquid is the restored default exchange
      '1m',
      '1m_api',
      'l2Book',
      'PB7 cache',
      'Build best 1m',
      'Delete selected',
      'Delete by Date',
      'Clear dataset',
      'Build Best 1m',
      'Copy Data',
      'Download l2Books',
      'Activity Log',
      // settings context block (:2950-2958) — settings panel is active
      'Save Settings',
      'Coin Refresh',
      'AWS / l2Book',
      'TradFi / Tiingo',
    ]);
  });

  it('marks the active section button (:9038)', () => {
    const app = mountApp();
    // section buttons only — the settings subsection nav and the inventory
    // view tabs carry their own active state (:6166, :6365)
    const active = app
      .findAll('#sidebar-toolbar .sb-btn')
      .filter(
        (b) => b.classes('active') && !b.classes('settings-subsection-btn') && !b.classes('inventory-subsection-btn')
      );
    expect(active).toHaveLength(1);
    expect(active[0]?.text()).toBe('Settings');
  });
});

describe('panel switching + persistence (:9032-9107, :9736-9746)', () => {
  it('shows only the restored panel on mount and defaults to settings', () => {
    const app = mountApp();
    expect(visiblePanelIds(app)).toEqual(['settings-panel']);
  });

  it('switches panels on section button clicks and persists (:9052-9056)', async () => {
    const app = mountApp();
    const statusButton = app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Status Monitor');
    await statusButton!.trigger('click');
    expect(visiblePanelIds(app)).toEqual(['status-panel']);
    expect(window.localStorage.getItem(LS_KEY_PANEL)).toBe('status-panel');
  });

  it('restores the persisted panel on load (bootstrap :9764)', () => {
    window.localStorage.setItem(LS_KEY_PANEL, 'inventory-panel');
    const app = mountApp();
    expect(visiblePanelIds(app)).toEqual(['inventory-panel']);
  });

  it('remaps the legacy actions-panel value to settings (:9743)', () => {
    window.localStorage.setItem(LS_KEY_PANEL, 'actions-panel');
    const app = mountApp();
    expect(visiblePanelIds(app)).toEqual(['settings-panel']);
  });

  it('falls back to settings for an unknown stored panel (:9744)', () => {
    window.localStorage.setItem(LS_KEY_PANEL, 'gone-panel');
    const app = mountApp();
    expect(visiblePanelIds(app)).toEqual(['settings-panel']);
  });

  it('renders placeholders for the M-data-8 activity panel only', () => {
    const app = mountApp();
    // only the activity panel remains a placeholder — M-data-7 landed the
    // best1m + copy-data bodies
    expect(app.findAll('.panel-placeholder')).toHaveLength(1);
    expect(app.find('#activity-panel .panel-placeholder').exists()).toBe(true);
    expect(app.find('#best1m-panel .panel-placeholder').exists()).toBe(false);
    expect(app.find('#copy-data-panel .panel-placeholder').exists()).toBe(false);
    expect(app.find('#settings-hyperliquid-tiingo').exists()).toBe(true);
    expect(app.find('#settings-hyperliquid-tradfi-map').exists()).toBe(true);
    expect(app.find('#status-panel .panel-placeholder').exists()).toBe(false);
    expect(app.find('#integrity-panel .panel-placeholder').exists()).toBe(false);
    expect(app.find('#inventory-panel .inventory-layout').exists()).toBe(true);
  });
});

describe('exchange context bar (:2965-2977, :7304-7313, :9766)', () => {
  it('renders the five legacy exchange options in order', () => {
    const app = mountApp();
    const options = app.findAll('#page-exchange option').map((o) => o.text());
    expect(options).toEqual(['Hyperliquid', 'Binance USDM', 'Bybit', 'Bitget', 'OKX']);
  });

  it('selects hyperliquid by default', () => {
    const app = mountApp();
    expect((app.find('#page-exchange').element as HTMLSelectElement).value).toBe('hyperliquid');
  });

  it('restores the persisted exchange (:9766)', () => {
    window.localStorage.setItem(LS_KEY_EXCHANGE, 'bybit');
    const app = mountApp();
    expect((app.find('#page-exchange').element as HTMLSelectElement).value).toBe('bybit');
  });

  it('persists the exchange on change (:7310)', async () => {
    const app = mountApp();
    await app.find('#page-exchange').setValue('okx');
    expect(window.localStorage.getItem(LS_KEY_EXCHANGE)).toBe('okx');
  });

  it('normalizes a legacy binance spelling through the fan-out (:7304-7306)', async () => {
    window.localStorage.setItem(LS_KEY_EXCHANGE, 'binanceusdm');
    const app = mountApp();
    await flushPromises();
    expect((app.find('#page-exchange').element as HTMLSelectElement).value).toBe('binance');
    expect(window.localStorage.getItem(LS_KEY_EXCHANGE)).toBe('binance');
    expect(statusMonitorSrcs(app)).toEqual([
      `${BASE}/api/market-data/status-monitor/binanceusdm`,
    ]);
  });
});

describe('status monitor iframe mount (:3223-3227, :4142-4174, :7406-7413, M-data-8)', () => {
  it('points the frame at the restored exchange on bootstrap (:9771 → :7315)', async () => {
    const app = mountApp();
    await flushPromises();
    expect(statusMonitorSrcs(app)).toEqual([`${BASE}/api/market-data/status-monitor/hyperliquid`]);
    const frame = app.find('#status-monitor-host').element as HTMLIFrameElement;
    expect(frame.dataset.exchange).toBe('hyperliquid');
    expect(frame.tagName).toBe('IFRAME');
  });

  it('shows the loading callout until the frame document loads (:4150-4154)', async () => {
    const app = mountApp();
    await flushPromises();
    const callout = app.find('#status-panel .callout');
    expect(callout.exists()).toBe(true);
    expect(callout.find('p').text()).toBe('Loading live market data status…');
    await app.find('#status-monitor-host').trigger('load');
    expect(app.find('#status-panel .callout').exists()).toBe(false);
  });

  it('swaps the frame src to the new exchange on change (:7315, :4148)', async () => {
    const app = mountApp();
    await flushPromises();
    const frame = app.find('#status-monitor-host').element as HTMLIFrameElement;
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    expect(frame.src).toBe(`${BASE}/api/market-data/status-monitor/bybit`);
    expect(frame.dataset.exchange).toBe('bybit');
  });

  it('does not remount when the same exchange is re-selected (:7410)', async () => {
    const app = mountApp();
    await flushPromises();
    const frame = app.find('#status-monitor-host').element as HTMLIFrameElement;
    const srcBefore = frame.src;
    await app.find('#page-exchange').setValue('hyperliquid');
    await flushPromises();
    expect(frame.src).toBe(srcBefore);
  });

  it('renders the warning callout when the frame navigation fails (:4166-4173)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#status-monitor-host').trigger('error');
    const callout = app.find('#status-panel .callout.warning');
    expect(callout.exists()).toBe(true);
    // iframe-level failure has no HTTP detail — the generic fallback message
    expect(callout.find('p').text()).toBe('Failed to load live status monitor.');
  });

  it('unmounts cleanly with the monitor frame attached (R2)', async () => {
    const app = mountApp();
    await flushPromises();
    expect(() => app.unmount()).not.toThrow();
    expect(document.getElementById('status-monitor-host')).toBeNull();
  });
});

describe('refreshStatuses bootstrap (:9772, :9076-9096)', () => {
  it('fetches all five exchange statuses once on mount', async () => {
    mountApp();
    await flushPromises();
    const statusCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.endsWith('/status/hyperliquid') || url.includes('/status/'))
      .filter((url) => !url.includes('/status-monitor/'));
    expect(statusCalls).toEqual([
      `${BASE}/api/market-data/status/hyperliquid`,
      `${BASE}/api/market-data/status/binanceusdm`,
      `${BASE}/api/market-data/status/bybit`,
      `${BASE}/api/market-data/status/bitget`,
      `${BASE}/api/market-data/status/okx`,
    ]);
  });
});

describe('sidebar shortcut modes (:9112-9120, :7687-7691, :7427-7446)', () => {
  it('opens the best1m panel in build mode (:9112-9115)', async () => {
    const app = mountApp();
    await app.find('#sidebar-best-1m-link').trigger('click');
    expect(visiblePanelIds(app)).toEqual(['best1m-panel']);
    expect(window.localStorage.getItem(LS_KEY_PANEL)).toBe('best1m-panel');
    const link = app.find('#sidebar-best-1m-link');
    expect(link.classes()).toContain('active');
    expect(link.attributes('aria-current')).toBe('page');
  });

  it('opens the best1m panel in download mode via the l2books shortcut (:9117-9120)', async () => {
    const app = mountApp();
    await app.find('#sidebar-l2books-link').trigger('click');
    expect(visiblePanelIds(app)).toEqual(['best1m-panel']);
    expect(app.find('#sidebar-l2books-link').classes()).toContain('active');
    expect(app.find('#sidebar-best-1m-link').classes()).not.toContain('active');
  });

  it('shows the l2books shortcut only on hyperliquid (:7422)', async () => {
    const app = mountApp();
    expect(app.find('#sidebar-l2books-link').attributes('hidden')).toBeUndefined();
    await app.find('#page-exchange').setValue('bybit');
    expect(app.find('#sidebar-l2books-link').attributes('hidden')).toBeDefined();
  });

  it('keeps the best-1m link active off hyperliquid in either mode (:7436)', async () => {
    const app = mountApp();
    await app.find('#page-exchange').setValue('bybit');
    await app.find('#sidebar-l2books-link').trigger('click'); // hidden but clickable
    expect(app.find('#sidebar-best-1m-link').classes()).toContain('active');
    expect(app.find('#sidebar-l2books-link').classes()).not.toContain('active');
  });
});

describe('settings panel integration (M-data-3, :2979-3085, :8881-8948, :7314)', () => {
  it('loads the settings payload through the bootstrap fan-out (:9771 → :7314)', async () => {
    mountApp();
    await flushPromises();
    const settingsCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/market-data/settings/') && !url.includes('tradfi-map'));
    expect(settingsCalls).toEqual([`${BASE}/api/market-data/settings/hyperliquid`]);
  });

  it('reloads settings when the exchange changes (:9611-9613 → :7314)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    const settingsCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/market-data/settings/') && !url.includes('tradfi-map'));
    expect(settingsCalls).toEqual([
      `${BASE}/api/market-data/settings/hyperliquid`,
      `${BASE}/api/market-data/settings/bybit`,
    ]);
  });

  it('renders the settings cards and fields from the payload', async () => {
    const app = mountApp();
    await flushPromises();
    expect(app.find('#settings-primary-card').exists()).toBe(true);
    expect(app.find('#settings-enabled-coins-card').exists()).toBe(true);
    expect(app.find('#settings-hyperliquid-aws').exists()).toBe(true);
    expect(app.find('#settings-hyperliquid-archive').exists()).toBe(true);
    expect(
      (app.find('#settings-interval-seconds').element as HTMLInputElement).value
    ).toBe('2700');
    expect(app.find('[data-settings-coin-row="BTC"]').classes()).toContain('selected');
  });

  it('keeps the save button disabled while clean and enables it on edit (:5528-5533)', async () => {
    const app = mountApp();
    await flushPromises();
    const save = app.find('#btn-save-settings-sidebar');
    expect(save.attributes('disabled')).toBeDefined();
    await app.find('#settings-interval-seconds').setValue('3600');
    expect(save.attributes('disabled')).toBeUndefined();
    expect(save.classes()).toContain('save-needed');
  });

  it('saves the collected request and re-baselines on success (:8930-8947)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#settings-interval-seconds').setValue('3600');
    await app.find('#btn-save-settings-sidebar').trigger('click');
    await flushPromises();
    const post = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes('/api/market-data/settings/'))
      .find((call) => (call[1] as RequestInit | undefined)?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String((post![1] as RequestInit).body));
    expect(body).toEqual({
      auto_enable_new_coins: false,
      enabled_coins: ['BTC'],
      settings: {
        interval_seconds: 3600,
        coin_pause_seconds: 0.5,
        api_timeout_seconds: 30,
        min_lookback_days: 2,
        max_lookback_days: 4,
        aws_profile: 'pbgui-hyperliquid',
        aws_access_key_id: '',
        aws_secret_access_key: '',
        aws_region: 'us-east-1',
        l2book_scan_timeout_s: 5,
        l2book_scan_workers: 8,
        l2book_archive_enabled: false,
        l2book_archive_dir: '',
      },
    });
    // toast + clean button after the re-baseline
    expect(app.findAll('.toast.success').map((toastEl) => toastEl.text())).toEqual([
      'Hyperliquid settings saved.',
    ]);
    expect(app.find('#btn-save-settings-sidebar').attributes('disabled')).toBeDefined();
  });

  it('switches to the settings panel and subsection on nav click (:9605-9608)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Status Monitor')!.trigger('click');
    expect(app.find('#sidebar-context-actions').attributes('hidden')).toBeDefined();
    await app.find('#btn-settings-subsection-aws').trigger('click');
    expect(visiblePanelIds(app)).toEqual(['settings-panel']);
    expect(window.localStorage.getItem('market_data_fastapi_settings_subsection')).toBe('aws');
    expect(app.find('#settings-hyperliquid-aws').classes()).not.toContain('settings-subsection-hidden');
    expect(app.find('#sidebar-context-actions').attributes('hidden')).toBeUndefined();
  });
});

describe('tiingo + tradfi integration (M-data-4, :7379-7401, :4924, :9734)', () => {
  it('loads the tradfi map after the settings payload renders (:7397)', async () => {
    mountApp();
    await flushPromises();
    const mapCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.endsWith('/settings/hyperliquid/tradfi-map'));
    expect(mapCalls).toEqual([`${BASE}/api/market-data/settings/hyperliquid/tradfi-map`]);
  });

  it('renders the map rows and the tiingo usage from the payload', async () => {
    const app = mountApp();
    await flushPromises();
    expect(app.find('#settings-hyperliquid-tradfi-map .tradfi-map-table').exists()).toBe(true);
    expect(app.find('[data-tradfi-xyz="TSLA"]').exists()).toBe(true);
    expect(app.find('#tradfi-cache-note').text()).toBe('meta · quote · spec');
    // settings.tiingo_usage rendered (:7396) with the configured callout
    expect(app.find('#settings-tiingo-credential-status').text()).toContain(
      'An active Tiingo vault profile is available'
    );
    expect(app.find('#settings-tiingo-usage .usage-card').exists()).toBe(true);
  });

  it('drops the cards and skips the map for other exchanges (:7362-7366, :7399-7401)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    expect(app.find('#settings-hyperliquid-tiingo').exists()).toBe(false);
    expect(app.find('#settings-hyperliquid-tradfi-map').exists()).toBe(false);
    const mapCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.endsWith('/settings/hyperliquid/tradfi-map'));
    expect(mapCalls).toHaveLength(1); // only the initial hyperliquid load
  });

  it('reveals the stored token through the eye and clears it on a vault 401 (:5620-5636, :4924)', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/api-keys/tradfi/reveal')) {
        // first reveal succeeds, then the session expires
        return new Response(JSON.stringify({ value: 'vault-secret' }), { status: 200 });
      }
      if (u.includes('/api/market-data/settings/')) return new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 });
      if (u.includes('/tradfi-map')) return new Response(JSON.stringify(TRADFI_MAP_PAYLOAD), { status: 200 });
      return new Response('{"running":false}', { status: 200 });
    });
    const app = mountApp();
    await flushPromises();
    const input = app.find('#settings-tiingo-token');
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click');
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('vault-secret');
    expect((input.element as HTMLInputElement).type).toBe('text');
    // second reveal: vault answers 401 → onUnauthorized wipes the revealed token
    fetchMock.mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/api-keys/tradfi/reveal')) {
        return new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
      }
      if (u.includes('/api/market-data/settings/')) return new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 });
      if (u.includes('/tradfi-map')) return new Response(JSON.stringify(TRADFI_MAP_PAYLOAD), { status: 200 });
      return new Response('{"running":false}', { status: 200 });
    });
    // hide (clears), then reveal again — the 401 fires the clear hook and the
    // stale generation drops the failure silently (:5635)
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click'); // hide+clear
    await flushPromises();
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click'); // reveal → 401
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('');
    expect((input.element as HTMLInputElement).type).toBe('password');
  });

  it('clears a revealed token on pagehide (:9734)', async () => {
    const app = mountApp();
    await flushPromises();
    const input = app.find('#settings-tiingo-token');
    await input.setValue('typed-token');
    await app.find('#settings-hyperliquid-tiingo .pw-eye-btn').trigger('click'); // unmask typed
    expect((input.element as HTMLInputElement).type).toBe('text');
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();
    expect((input.element as HTMLInputElement).type).toBe('password'); // remasked
  });

  it('removes the pagehide listener on unmount', async () => {
    const app = mountApp();
    await flushPromises();
    app.unmount();
    // the cleared state no longer flips — the listener is gone
    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
  });
});

describe('integrity panel integration (M-data-5, :9066-9071, :7324-7332, :4562-4605)', () => {
  const INTEGRITY_CHECKSUM = {
    publish_enabled: false,
    publish_archive: '',
    reference_archive: '',
    archives: [{ name: 'own', repository: 'me/pbgui', can_publish: true, can_reference: false }],
    catalog: { initial_scan_complete: true, counts: { valid: 1, invalid: 0 } },
    reference: {},
  };

  function integrityFetchMock(url: string | URL): Promise<Response> {
    const u = String(url);
    if (u === `${BASE}/api/market-data/checksums/settings`) {
      return Promise.resolve(new Response(JSON.stringify(INTEGRITY_CHECKSUM), { status: 200 }));
    }
    if (u.includes('/api/market-data/integrity/status')) {
      return Promise.resolve(new Response(JSON.stringify({ catalog: INTEGRITY_CHECKSUM.catalog }), { status: 200 }));
    }
    if (u.includes('/api/market-data/integrity/removed-coins')) {
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    }
    if (u.includes('/api/market-data/integrity/issues')) {
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    }
    if (u.includes('/api/jobs/')) {
      return Promise.resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
    }
    if (u.includes('/api/market-data/settings/')) {
      return Promise.resolve(new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 }));
    }
    return Promise.resolve(new Response('{"running":false}', { status: 200 }));
  }

  function urlsOf(): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]));
  }

  it('loads the panel and starts the 2 s job poll when the panel is restored active (:9764 → :9066-9068)', async () => {
    window.localStorage.setItem(LS_KEY_PANEL, 'integrity-panel');
    fetchMock.mockImplementation(integrityFetchMock);
    const app = mountApp();
    await flushPromises();
    expect(visiblePanelIds(app)).toEqual(['integrity-panel']);
    expect(urlsOf()).toEqual(expect.arrayContaining([
      `${BASE}/api/market-data/checksums/settings`,
      `${BASE}/api/market-data/integrity/status?exchange=hyperliquid`,
      `${BASE}/api/market-data/integrity/removed-coins?exchange=hyperliquid`,
      `${BASE}/api/market-data/integrity/issues?exchange=hyperliquid&limit=1000000`,
      `${BASE}/api/jobs/?states=pending,running&limit=100`,
    ]));
    // job monitor iframe mounted with the hyperliquid URL matrix (:4238-4244)
    const frame = app.find('#integrity-job-monitor-frame').element as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toContain('exchange=hyperliquid');
    expect(decodeURIComponent(frame.getAttribute('src') ?? '')).toContain('ohlcv_hyperliquid_normalize_fallback');
    app.unmount();
  });

  it('stops the poll when switching away and restarts it on return (:9066-9071, R5)', async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem(LS_KEY_PANEL, 'integrity-panel');
      fetchMock.mockImplementation(integrityFetchMock);
      const app = mountApp();
      await vi.advanceTimersByTimeAsync(0);
      const jobsAfterEnter = urlsOf().filter((url) => url.includes('/api/jobs/')).length;
      expect(jobsAfterEnter).toBe(1);
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Settings')!.trigger('click');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(urlsOf().filter((url) => url.includes('/api/jobs/'))).toHaveLength(1); // chain dead
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'OHLCV Integrity')!.trigger('click');
      await vi.advanceTimersByTimeAsync(0);
      expect(urlsOf().filter((url) => url.includes('/api/jobs/'))).toHaveLength(2); // immediate restart
      await vi.advanceTimersByTimeAsync(2000);
      expect(urlsOf().filter((url) => url.includes('/api/jobs/'))).toHaveLength(3); // 2 s chain
      app.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets and force-reloads the panel when the exchange changes while active (:7324-7332)', async () => {
    window.localStorage.setItem(LS_KEY_PANEL, 'integrity-panel');
    fetchMock.mockImplementation(integrityFetchMock);
    const app = mountApp();
    await flushPromises();
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    expect(urlsOf().filter((url) => url.includes('/integrity/status?exchange=bybit'))).toHaveLength(1);
    const frame = app.find('#integrity-job-monitor-frame').element as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toContain('exchange=bybit');
    expect(decodeURIComponent(frame.getAttribute('src') ?? '')).toContain('ohlcv_checksum_publish');
    app.unmount();
  });
});

describe('best1m panel integration (M-data-7, :9058, :7321-7323, :7662-7685)', () => {
  function best1mFetchMock(url: string | URL): Promise<Response> {
    const u = String(url);
    if (u.includes('/api/market-data/best-1m/info/')) {
      return Promise.resolve(
        new Response(JSON.stringify({ exchange: 'bybit', coins: ['BTC', 'ETH'] }), { status: 200 })
      );
    }
    if (u.includes('/api/market-data/settings/')) {
      return Promise.resolve(new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 }));
    }
    return Promise.resolve(new Response('{"running":false}', { status: 200 }));
  }

  it('refreshes the panel on enter through the shortcut (:9112-9115 → :9058)', async () => {
    fetchMock.mockImplementation(best1mFetchMock);
    const app = mountApp();
    await app.find('#sidebar-best-1m-link').trigger('click');
    await flushPromises();
    expect(visiblePanelIds(app)).toEqual(['best1m-panel']);
    const infoCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/best-1m/info/'));
    // hyperliquid never fetches the generic info — the iframe is the panel
    // (:7670-7677)
    expect(infoCalls).toEqual([]);
    expect(app.find('#best1m-generic-panel').attributes('hidden')).toBeDefined();
    const frame = app.find('#best1m-hyperliquid-frame').element as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe(
      `${BASE}/api/market-data/data-actions/hyperliquid?section=build`
    );
    app.unmount();
  });

  it('switches to the generic variant and reloads on exchange change while active (:7321-7323)', async () => {
    window.localStorage.setItem(LS_KEY_EXCHANGE, 'bybit');
    fetchMock.mockImplementation(best1mFetchMock);
    const app = mountApp();
    await app.find('#sidebar-best-1m-link').trigger('click');
    await flushPromises();
    expect(app.find('#best1m-generic-panel').attributes('hidden')).toBeUndefined();
    const monitor = app.find('#best1m-job-monitor-frame').element as HTMLIFrameElement;
    expect(monitor.getAttribute('src')).toBe(
      `/app/jobs_monitor.html?v=S1&embed=1&exchange=bybit&job_type=bybit_best_1m`
    );
    const infoCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/best-1m/info/'));
    expect(infoCalls).toEqual([`${BASE}/api/market-data/best-1m/info/bybit`]);
    await app.find('#page-exchange').setValue('okx');
    await flushPromises();
    const okxCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/best-1m/info/okx'));
    expect(okxCalls).toEqual([`${BASE}/api/market-data/best-1m/info/okx`]);
    app.unmount();
  });
});

describe('copy-data panel integration (M-data-7, :9059-9064, :5127-5153)', () => {
  function copyDataFetchMock(url: string | URL): Promise<Response> {
    const u = String(url);
    if (u.endsWith('/api/market-data/copy-data/schedules')) {
      return Promise.resolve(
        new Response(JSON.stringify({ schedules: [{ id: 's1', name: 'Nightly', enabled: true }] }), { status: 200 })
      );
    }
    if (u.includes('/api/market-data/settings/')) {
      return Promise.resolve(new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 }));
    }
    return Promise.resolve(new Response('{"running":false}', { status: 200 }));
  }

  it('mounts the monitor and starts the 15 s schedule poll on enter (:9059-9061)', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementation(copyDataFetchMock);
      const app = mountApp();
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Copy Data')!.trigger('click');
      await vi.advanceTimersByTimeAsync(0);
      const scheduleCalls = fetchMock.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => url.endsWith('/copy-data/schedules'));
      expect(scheduleCalls).toEqual([`${BASE}/api/market-data/copy-data/schedules`]);
      const frame = app.find('#copy-data-job-monitor-frame').element as HTMLIFrameElement;
      expect(frame.getAttribute('src')).toBe(
        `/app/jobs_monitor.html?v=S1&embed=1&exchange=ohlcv&job_type=ohlcv_copy%2Cohlcv_copy_dry_run`
      );
      await vi.advanceTimersByTimeAsync(15_000);
      expect(
        fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.endsWith('/copy-data/schedules'))
      ).toHaveLength(2); // 15 s chain
      // leaving the panel stops the chain (:9063)
      await app.findAll('#sidebar-toolbar .sb-btn').find((b) => b.text() === 'Settings')!.trigger('click');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(
        fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.endsWith('/copy-data/schedules'))
      ).toHaveLength(2); // chain dead
      app.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('help opener wiring (:4085-4089)', () => {
  it('wires PBGUI_HELP_OPENER/_openMarketDataHelp to the shared overlay', () => {
    const open = vi.fn();
    window.PBGuiSharedHelp = { open };
    mountApp();
    expect(typeof window.PBGUI_HELP_OPENER).toBe('function');
    window.PBGUI_HELP_OPENER!();
    expect(open).toHaveBeenCalledWith('market data', { token: 'tok' });
  });

  it('no-ops when the shared overlay script is absent (:4086)', () => {
    mountApp();
    expect(() => window._openMarketDataHelp!()).not.toThrow();
  });
});

describe('data-tip tooltip mount (legacy :3637)', () => {
  it('renders the tooltip element and reacts to [data-tip] hovers (:3843)', async () => {
    const app = mountApp();
    const tip = document.getElementById('data-tip-tooltip') as HTMLElement;
    expect(tip).toBeInstanceOf(HTMLElement);
    const el = document.createElement('span');
    el.setAttribute('data-tip', 'hint text');
    document.body.appendChild(el);
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await app.vm.$nextTick();
    expect(tip.textContent).toBe('hint text');
    expect(tip.style.display).toBe('block');
  });
});

describe('toast stack mount (legacy :3638)', () => {
  it('renders the empty toast stack container', () => {
    const app = mountApp();
    expect(app.find('#toast-stack').exists()).toBe(true);
    expect(app.findAll('.toast')).toHaveLength(0);
  });
});
