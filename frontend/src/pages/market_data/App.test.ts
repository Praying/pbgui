import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import {
  clearAppTestGlobals,
  installFetchMock,
  flushPromises,
  mountApp,
  visiblePanelIds,
  BASE,
  LS_KEY_EXCHANGE,
  LS_KEY_PANEL,
} from './App.test-support';

/* M-data-1 shell integration: sidebar registry → PanelShell switching with
   persistence (legacy setActivePanel/restorePanel :9032-9107, :9736-9773),
   the exchange context bar (:2965-2977).
   M-data-2: setContextExchange fan-out (:7304-7333, :9611-9613), sidebar
   shortcut modes (:9112-9120, :7415-7446), refreshStatuses bootstrap
   (:9772), help opener (:4085-4089), data-tip tooltip (:3637).
   M-data-8: the per-panel integration suites live in App.settings /
   App.tradfi / App.integrity / App.best1m-copy / App.status .test.ts; this
   file keeps the page shell, panel routing, exchange context and global
   chrome wiring. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({
    token: 'tok',
    origin: 'http://pbgui.test:8000',
    version: '1.0.0',
    serial: 'S1',
  })),
}));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = installFetchMock();
});

afterEach(() => {
  clearAppTestGlobals();
});

describe('page skeleton (legacy DOM :2836, :2917-2977)', () => {
  it('renders the topnav placeholder, sidebar and main content', () => {
    const app = mountApp();
    expect(app.find('nav#topnav').exists()).toBe(true);
    expect(app.find('#page-body').exists()).toBe(true);
    expect(app.find('#sidebar').exists()).toBe(true);
    expect(app.find('#main-content').exists()).toBe(true);
    expect(app.find('.migration-watermark').exists()).toBe(false);
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
    const frame = app.find('#status-monitor-host').element as HTMLIFrameElement;
    expect(frame.src).toBe(`${BASE}/api/market-data/status-monitor/binanceusdm`);
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
