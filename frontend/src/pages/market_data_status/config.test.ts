import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import {
  NOTIFY_LOG_URL,
  apiBase,
  cancelRefreshUrl,
  readExchange,
  refreshNowUrl,
  stopRunUrl,
  wsUrl,
} from './config';

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' })),
  apiPath: (path: string) => path,
  wsOrigin: () => 'ws://pbgui.test:8000',
  pageOrigin: () => 'http://pbgui.test:8000',
}));

const getBootMock = vi.mocked(getBoot);

describe('market_data_status config', () => {
  beforeEach(() => {
    getBootMock.mockReturnValue({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' });
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    document.getElementById('mds-app')?.remove();
  });

  it('derives the REST base from boot.js origin', () => {
    expect(apiBase()).toBe('/api');
  });

  it('derives the market-data WebSocket URL from the boot origin', () => {
    expect(wsUrl('binance')).toBe('ws://pbgui.test:8000/ws/market-data?exchange=binance');
  });

  it('encodes the exchange in the WebSocket URL', () => {
    expect(wsUrl('BTC USDT')).toBe('ws://pbgui.test:8000/ws/market-data?exchange=BTC%20USDT');
  });

  it('builds the three action endpoints on the market-data router', () => {
    expect(refreshNowUrl()).toBe('/api/market-data/refresh-now');
    expect(cancelRefreshUrl()).toBe('/api/market-data/cancel-refresh');
    expect(stopRunUrl()).toBe('/api/market-data/stop-run');
  });

  it('keeps the legacy literal notify_log path', () => {
    expect(NOTIFY_LOG_URL).toBe('/api/notify_log');
  });

});

describe('readExchange (legacy data-exchange resolution)', () => {
  afterEach(() => {
    document.getElementById('mds-app')?.remove();
    window.history.replaceState(null, '', '/');
  });

  function mountElementWith(exchange: string): HTMLElement {
    const el = document.createElement('div');
    el.id = 'mds-app';
    el.dataset.exchange = exchange;
    document.body.appendChild(el);
    return el;
  }

  it('reads, trims and lowercases the mount element data-exchange attribute', () => {
    mountElementWith('  Binance ');
    expect(readExchange()).toBe('binance');
  });

  it('falls back to the exchange query parameter', () => {
    window.history.replaceState(null, '', '/api/market-data/status-monitor?exchange=Bybit');
    expect(readExchange()).toBe('bybit');
  });

  it('falls back to the trailing status-monitor path segment', () => {
    window.history.replaceState(null, '', '/api/market-data/status-monitor/hyperliquid');
    expect(readExchange()).toBe('hyperliquid');
  });

  it('returns an empty string when nothing resolves', () => {
    window.history.replaceState(null, '', '/');
    expect(readExchange()).toBe('');
  });
});
