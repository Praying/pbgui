import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import {
  NOTIFY_LOG_URL,
  apiUrl,
  heatmapApiBase,
  heatmapApiUrl,
  jobsApiUrl,
  marketDataApiBase,
  toHeatmapBase,
  wsBase,
} from './config';

/* Legacy URL plumbing (market_data_main.html): %%API_BASE%% was origin +
   /api/market-data (api/market_data.py:164-192); apiUrl/jobsApiUrl/heatmap*
   derive every other base from it with regex rewrites. The Vue page rebuilds
   API_BASE from /api/boot.js (cookie-session parity, services_monitor
   config.ts convention) and keeps the rewrites verbatim. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' })),
  apiPath: (path: string) => path,
  wsOrigin: () => 'ws://pbgui.test:8000',
  pageOrigin: () => 'http://pbgui.test:8000',
}));

const getBootMock = vi.mocked(getBoot);

beforeEach(() => {
  getBootMock.mockReturnValue({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' });
});

afterEach(() => {
  delete (window as Window & { WS_BASE?: string }).WS_BASE;
});

describe('market-data URL bases (legacy apiUrl :4176, jobsApiUrl :4180, heatmapApiBase :4888)', () => {
  it('derives the market-data base from the boot origin', () => {
    expect(marketDataApiBase()).toBe('/api/market-data');
  });

  it('concatenates paths onto the market-data base (apiUrl)', () => {
    expect(apiUrl('/status/hyperliquid')).toBe('/api/market-data/status/hyperliquid');
    expect(apiUrl('/settings/binance')).toBe('/api/market-data/settings/binance');
  });

  it('strips /market-data for the jobs root (jobsApiUrl :4180-4183)', () => {
    expect(jobsApiUrl('/jobs/')).toBe('/api/jobs/');
    expect(jobsApiUrl('/api-keys/tradfi/profiles')).toBe('/api/api-keys/tradfi/profiles');
  });

  it('rewrites /market-data to /heatmap (heatmapApiBase :4888-4890)', () => {
    expect(heatmapApiBase()).toBe('/api/heatmap');
    expect(heatmapApiUrl('/overview')).toBe('/api/heatmap/overview');
    expect(heatmapApiUrl('/queue-build-ohlcv')).toBe('/api/heatmap/queue-build-ohlcv');
  });

  it('keeps the literal notify_log path', () => {
    expect(NOTIFY_LOG_URL).toBe('/api/notify_log');
  });
});

describe('legacy regex parity (pure base rewrites)', () => {
  it('jobs root strip tolerates the optional trailing slash (legacy /\\/market-data\\/?$)', () => {
    expect(jobsApiUrl('/jobs/')).toBe('/api/jobs/');
  });

  it('only strips a trailing /market-data segment, not inner occurrences', () => {
    // legacy replace(/\/market-data\/?$/, '') anchors at the end
    const base = '/api/market-data';
    expect(jobsApiUrl('/jobs/')).toBe(base.replace(/\/market-data\/?$/, '') + '/jobs/');
  });

  it('heatmap rewrite only matches the final /market-data', () => {
    expect(toHeatmapBase('http://h:1/api/market-data')).toBe('http://h:1/api/heatmap');
    // no trailing-slash tolerance in the legacy heatmap regex
    expect(toHeatmapBase('http://h:1/api/market-data/')).toBe('http://h:1/api/market-data/');
    // inner occurrence untouched (anchored at end only)
    expect(toHeatmapBase('http://h:1/market-data/x')).toBe('http://h:1/market-data/x');
  });
});

describe('wsBase (legacy getWsBase :4102-4106)', () => {
  it('maps the page protocol to ws:// (jsdom serves http)', () => {
    expect(window.location.protocol).toBe('http:');
    expect(wsBase()).toBe(`ws://${window.location.host}`);
  });

  it('prefers window.WS_BASE when the injector provides one', () => {
    (window as Window & { WS_BASE?: string }).WS_BASE = 'wss://proxy.example';
    expect(wsBase()).toBe('wss://proxy.example');
  });
});
