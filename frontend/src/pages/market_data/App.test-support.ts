import { vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/*
 * M-data-8 — the App integration testkit. App.test.ts outgrew the 800-line
 * ceiling; the per-panel integration suites (App.settings/.tradfi/.integrity/
 * .best1m-copy/.status.test.ts) share these fixtures and helpers. NOT a test
 * file (the vitest include only collects *.test.ts names). The boot.js mock
 * is NOT here: vi.mock is hoisted per test file, so every suite declares
 * its own copy.
 */

export const LS_KEY_PANEL = 'market_data_fastapi_active_panel';
export const LS_KEY_EXCHANGE = 'market_data_fastapi_context_exchange';

export const BASE = 'http://pbgui.test:8000';

export const SETTINGS_PAYLOAD = {
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

export const TRADFI_MAP_PAYLOAD = {
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

export const BYBIT_SETTINGS_PAYLOAD = {
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

export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function mountApp() {
  return mount(App, {
    global: { plugins: [createI18n('en')] },
    attachTo: document.body,
  });
}

export function visiblePanelIds(wrapper: ReturnType<typeof mountApp>): string[] {
  return wrapper
    .findAll('section.content-panel')
    .filter((s) => s.attributes('hidden') === undefined)
    .map((s) => s.attributes('id') ?? '');
}

export function statusMonitorSrcs(wrapper: ReturnType<typeof mountApp>): string[] {
  return [wrapper.find('#status-monitor-host').element as HTMLIFrameElement]
    .map((frame) => frame.src)
    .filter((src) => src.includes('/status-monitor/'));
}

/** Default backend mock — settings payloads are exchange-aware (:8885). */
export function defaultFetchMock(url: string | URL, init?: RequestInit): Promise<Response> {
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

/** beforeEach: fresh fetch stub over the default mock; returns the spy so a
 *  suite can re-implement specific routes (the legacy per-test overrides). */
export function installFetchMock(): ReturnType<typeof vi.fn> {
  window.localStorage.clear();
  const fetchSpy = vi.fn(defaultFetchMock);
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

/** afterEach: localStorage, fetch stub and App's window globals. */
export function clearAppTestGlobals(): void {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  delete window.PBGuiSharedHelp;
  delete window._openMarketDataHelp;
  delete window.PBGUI_HELP_OPENER;
  document.body.innerHTML = '';
}
