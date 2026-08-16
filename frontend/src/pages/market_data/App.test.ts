import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/* M-data-1 shell integration: sidebar registry → PanelShell switching with
   persistence (legacy setActivePanel/restorePanel :9032-9107, :9736-9773),
   the exchange context bar (:2965-2977) and the persisted context exchange
   (:7310, :9766). Panel bodies are placeholders until M-data-2..7. */

const LS_KEY_PANEL = 'market_data_fastapi_active_panel';
const LS_KEY_EXCHANGE = 'market_data_fastapi_context_exchange';

let fetchMock: ReturnType<typeof vi.fn>;

function mountApp() {
  return mount(App, { global: { plugins: [createI18n('en')] } });
}

function visiblePanelIds(wrapper: ReturnType<typeof mountApp>): string[] {
  return wrapper
    .findAll('section.content-panel')
    .filter((s) => s.attributes('hidden') === undefined)
    .map((s) => s.attributes('id') ?? '');
}

beforeEach(() => {
  window.localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
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
    ]);
  });

  it('marks the active section button (:9038)', () => {
    const app = mountApp();
    const active = app.findAll('#sidebar-toolbar .sb-btn').filter((b) => b.classes('active'));
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

  it('activates best1m via the sidebar shortcut link (:9112-9115)', async () => {
    const app = mountApp();
    const link = app.find('#sidebar-best-1m-link');
    expect(link.exists()).toBe(true);
    await link.trigger('click');
    expect(visiblePanelIds(app)).toEqual(['best1m-panel']);
    expect(window.localStorage.getItem(LS_KEY_PANEL)).toBe('best1m-panel');
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

  it('renders an empty placeholder for every panel body until M-data-2..7 land', () => {
    const app = mountApp();
    const placeholders = app.findAll('.panel-placeholder');
    expect(placeholders).toHaveLength(7);
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
});

describe('toast stack mount (legacy :3638)', () => {
  it('renders the empty toast stack container', () => {
    const app = mountApp();
    expect(app.find('#toast-stack').exists()).toBe(true);
    expect(app.findAll('.toast')).toHaveLength(0);
  });
});
