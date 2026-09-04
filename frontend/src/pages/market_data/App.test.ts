import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { openSelect, pickSelectOption, selectOptionTexts } from '@/shared/testing/select';
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

/* M-data-1 shell integration: panel registry → PanelShell switching with
   persistence (legacy setActivePanel/restorePanel :9032-9107, :9736-9773),
   the exchange context bar (:2965-2977).
   M-data-2: setContextExchange fan-out (:7304-7333, :9611-9613), best-1m
   shortcut modes (:9112-9120, :7415-7446), refreshStatuses bootstrap
   (:9772), help opener (:4085-4089), data-tip tooltip (:3637).
   Rail migration: the legacy #sidebar column is retired — first-level
   sections render as rail children ([data-testid="rail-section-<key>"]);
   the l2books download entry lives in the best-1m panel's mode switch.
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
// Unmount before the globals clear above (LIFO): clearing first destroys the
// reka select teleport anchors and the deferred unmount then throws
// removeFragment on a null parent (seen as the full-suite flake in the
// exchange-context tests).
enableAutoUnmount(afterEach);

describe('page skeleton (legacy DOM :2836, :2917-2977)', () => {
  it('renders the shared shell, rail sections and main content', () => {
    const app = mountApp();
    expect(app.find('.app-shell').exists()).toBe(true);
    expect(app.find('nav#topnav').exists()).toBe(false);
    expect(app.find('#page-body').exists()).toBe(true);
    // the in-page sidebar column is retired — sections live in the rail
    expect(app.find('#sidebar').exists()).toBe(false);
    expect(app.find('[data-testid="rail-section-settings-panel"]').exists()).toBe(true);
    expect(app.find('#main-content').exists()).toBe(true);
    expect(app.findAll('main')).toHaveLength(1);
    expect(app.get('#main-content').element.tagName).toBe('DIV');
    expect(app.find('.migration-watermark').exists()).toBe(false);
  });

  it('sets the document title from the legacy market.title key (:3646)', () => {
    mountApp();
    expect(document.title).toBe('Market Data - PBGui');
  });

  it('renders one rail section per registry panel in legacy order (:3674-3682)', () => {
    const app = mountApp();
    const sections = app.findAll('.workbench-rail__subitem');
    // count assertion — every sectionButtons panel is reachable from the rail
    expect(sections).toHaveLength(7);
    expect(sections.map((s) => s.text())).toEqual([
      'Settings',
      'Status Monitor',
      'OHLCV Data',
      'OHLCV Integrity',
      'Build Best 1m',
      'Copy Data',
      'Activity Log',
    ]);
  });

  it('marks the active rail section (:9038)', () => {
    const app = mountApp();
    const active = app.findAll('.workbench-rail__subitem--active');
    expect(active).toHaveLength(1);
    expect(active[0]?.text()).toBe('Settings');
    expect(active[0]?.attributes('aria-current')).toBe('location');
  });
});

describe('panel switching + persistence (:9032-9107, :9736-9746)', () => {
  it('shows only the restored panel on mount and defaults to settings', () => {
    const app = mountApp();
    expect(visiblePanelIds(app)).toEqual(['settings-panel']);
  });

  it('switches panels on rail section clicks and persists (:9052-9056)', async () => {
    const app = mountApp();
    await app.find('[data-testid="rail-section-status-panel"]').trigger('click');
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

  it('renders the M-data-8 activity log body with every panel landed', () => {
    const app = mountApp();
    // M-data-8 replaced the last placeholder — the activity panel hosts the
    // shared LogViewerPanel script bridge, no .panel-placeholder remains
    expect(app.findAll('.panel-placeholder')).toHaveLength(0);
    expect(app.find('#activity-panel .activity-log-shell').exists()).toBe(true);
    expect(app.find('#activity-log-target').exists()).toBe(true);
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
  it('renders the five legacy exchange options in order', async () => {
    const app = mountApp();
    await openSelect(app, '#page-exchange');
    expect(selectOptionTexts()).toEqual(['Hyperliquid', 'Binance USDM', 'Bybit', 'Bitget', 'OKX']);
  });

  it('selects hyperliquid by default', () => {
    const app = mountApp();
    expect(app.find('#page-exchange').text()).toContain('Hyperliquid');
  });

  it('restores the persisted exchange (:9766)', () => {
    window.localStorage.setItem(LS_KEY_EXCHANGE, 'bybit');
    const app = mountApp();
    expect(app.find('#page-exchange').text()).toContain('Bybit');
  });

  it('persists the exchange on change (:7310)', async () => {
    const app = mountApp();
    await pickSelectOption(app, '#page-exchange', 'OKX');
    expect(window.localStorage.getItem(LS_KEY_EXCHANGE)).toBe('okx');
  });

  it('normalizes a legacy binance spelling through the fan-out (:7304-7306)', async () => {
    window.localStorage.setItem(LS_KEY_EXCHANGE, 'binanceusdm');
    const app = mountApp();
    await flushPromises();
    expect(app.find('#page-exchange').text()).toContain('Binance USDM');
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

describe('best-1m entries (rail section :2946 + in-panel mode switch :2948)', () => {
  it('opens the best1m panel in build mode from the rail section (:9112-9115)', async () => {
    const app = mountApp();
    await app.find('[data-testid="rail-section-best1m-panel"]').trigger('click');
    expect(visiblePanelIds(app)).toEqual(['best1m-panel']);
    expect(window.localStorage.getItem(LS_KEY_PANEL)).toBe('best1m-panel');
    // the rail entry carries the active state (legacy link highlight :7436)
    const section = app.find('[data-testid="rail-section-best1m-panel"]');
    expect(section.classes()).toContain('workbench-rail__subitem--active');
    expect(section.attributes('aria-current')).toBe('location');
  });

  it('switches to download mode via the in-panel l2books control (:9117-9120)', async () => {
    const app = mountApp();
    await app.find('[data-testid="rail-section-best1m-panel"]').trigger('click');
    await app.find('#best1m-mode-download').trigger('click');
    expect(visiblePanelIds(app)).toEqual(['best1m-panel']);
    expect(app.find('#best1m-mode-download').classes()).toContain('active');
    expect(app.find('#best1m-mode-build').classes()).not.toContain('active');
    // switching back to build re-fires the panel refresh path
    await app.find('#best1m-mode-build').trigger('click');
    expect(app.find('#best1m-mode-build').classes()).toContain('active');
    expect(app.find('#best1m-mode-download').classes()).not.toContain('active');
  });

  it('shows the in-panel download control only on hyperliquid (:7422)', async () => {
    const app = mountApp();
    expect(app.find('#best1m-mode-switch').exists()).toBe(true);
    await pickSelectOption(app, '#page-exchange', 'Bybit');
    expect(app.find('#best1m-mode-switch').exists()).toBe(false);
  });
});

describe('help opener wiring (:4085-4089)', () => {
  it('wires PBGUI_HELP_OPENER/_openMarketDataHelp on mount', () => {
    mountApp();
    expect(typeof window.PBGUI_HELP_OPENER).toBe('function');
    expect(typeof window._openMarketDataHelp).toBe('function');
    expect(() => window.PBGUI_HELP_OPENER!()).not.toThrow();
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
