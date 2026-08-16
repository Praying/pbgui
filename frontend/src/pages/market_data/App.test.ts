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
   (:4085-4089), data-tip tooltip (:3637). */

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

const FRAGMENT_HTML = '<div class="mds-root" id="__MDS_ROOT_ID__">fragment</div><script>void 0;<\/script>';
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

function statusMonitorCalls(): string[] {
  return fetchMock.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes('/status-monitor/'));
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/status-monitor/')) {
      return new Response(FRAGMENT_HTML, { status: 200 });
    }
    if (u.includes('/api/market-data/settings/')) {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({ success: true, message: 'Hyperliquid settings saved.', settings: SETTINGS_PAYLOAD }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 });
    }
    return new Response('{"running":false}', { status: 200 });
  });
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
    // section buttons only — the settings subsection nav carries its own
    // active state (:6166)
    const active = app
      .findAll('#sidebar-toolbar .sb-btn')
      .filter((b) => b.classes('active') && !b.classes('settings-subsection-btn'));
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

  it('renders placeholders for the M-data-4..7 panels only', () => {
    const app = mountApp();
    // five unlanded panels + the two M-data-4 cards inside settings
    expect(app.findAll('.panel-placeholder')).toHaveLength(7);
    expect(app.findAll('#settings-panel .panel-placeholder')).toHaveLength(2);
    expect(app.find('#status-panel .panel-placeholder').exists()).toBe(false);
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
    expect(statusMonitorCalls()).toEqual([
      `${BASE}/api/market-data/status-monitor/binanceusdm`,
    ]);
  });
});

describe('status monitor fragment mount (:3223-3227, :4142-4174, :7406-7413)', () => {
  it('mounts the restored exchange fragment on bootstrap (:9771 → :7315)', async () => {
    const app = mountApp();
    await flushPromises();
    expect(statusMonitorCalls()).toEqual([`${BASE}/api/market-data/status-monitor/hyperliquid`]);
    const host = app.find('#status-monitor-host').element as HTMLElement;
    expect(host.dataset.exchange).toBe('hyperliquid');
    expect(host.querySelector('.mds-root')).not.toBeNull();
  });

  it('shows the loading callout while the fragment is in flight (:4150-4154)', async () => {
    let release: (body: string) => void = () => undefined;
    fetchMock.mockImplementation(
      async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/status-monitor/')) {
          return new Promise<Response>((resolve) => {
            release = (body) => resolve(new Response(body, { status: 200 }));
          });
        }
        if (u.includes('/api/market-data/settings/') && init?.method !== 'POST') {
          return new Response(JSON.stringify(SETTINGS_PAYLOAD), { status: 200 });
        }
        return new Response('{"running":false}', { status: 200 });
      }
    );
    const app = mountApp();
    await flushPromises();
    const callout = app.find('#status-panel .callout');
    expect(callout.exists()).toBe(true);
    expect(callout.find('p').text()).toBe('Loading live market data status…');
    release(FRAGMENT_HTML);
    await flushPromises();
    expect(app.find('#status-panel .callout').exists()).toBe(false);
  });

  it('destroys the live fragment and remounts on exchange change (:7315, :4148)', async () => {
    const app = mountApp();
    await flushPromises();
    const host = app.find('#status-monitor-host').element as HTMLElement;
    const destroy = vi.fn();
    (host.querySelector('.mds-root') as HTMLElement & { __mdsDestroy?: () => void }).__mdsDestroy =
      destroy;
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(statusMonitorCalls()).toEqual([
      `${BASE}/api/market-data/status-monitor/hyperliquid`,
      `${BASE}/api/market-data/status-monitor/bybit`,
    ]);
    expect(host.dataset.exchange).toBe('bybit');
  });

  it('does not remount when the same exchange is re-selected (:7410)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#page-exchange').setValue('hyperliquid');
    await flushPromises();
    expect(statusMonitorCalls()).toEqual([`${BASE}/api/market-data/status-monitor/hyperliquid`]);
  });

  it('renders the escaped error callout when the fragment fails (:4166-4173)', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      if (String(url).includes('/status-monitor/')) {
        return new Response('<img src=x onerror=alert(1)>', { status: 500 });
      }
      return new Response('{}', { status: 200 });
    });
    const app = mountApp();
    await flushPromises();
    const callout = app.find('#status-panel .callout.warning');
    expect(callout.exists()).toBe(true);
    expect(callout.find('p').text()).toBe('HTTP 500');
    expect(app.find('#status-panel .callout.warning img').exists()).toBe(false);
  });

  it('destroys the fragment when the app unmounts (R2)', async () => {
    const app = mountApp();
    await flushPromises();
    const host = app.find('#status-monitor-host').element as HTMLElement;
    const destroy = vi.fn();
    (host.querySelector('.mds-root') as HTMLElement & { __mdsDestroy?: () => void }).__mdsDestroy =
      destroy;
    app.unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
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
      .filter((url) => url.includes('/api/market-data/settings/'));
    expect(settingsCalls).toEqual([`${BASE}/api/market-data/settings/hyperliquid`]);
  });

  it('reloads settings when the exchange changes (:9611-9613 → :7314)', async () => {
    const app = mountApp();
    await flushPromises();
    await app.find('#page-exchange').setValue('bybit');
    await flushPromises();
    const settingsCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/market-data/settings/'));
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
