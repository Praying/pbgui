import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshStatuses, useStatusSummaries } from './useStatusSummaries';

/* Legacy fetchStatus/refreshStatuses (market_data_main.html:9076-9096) and
   the bootstrap call (:9772). The payloads are write-only in legacy
   (uiState.statusPayloads has no consumer) — ported for parity. */

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

let calls: Recorded[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  calls = [];
  fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response('{"ok":true}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  // config.ts derives the base from boot.js
  (globalThis as { __BOOT__?: unknown }).__BOOT__ = {
    origin: 'http://pbgui.test:8000',
    token: 'tok',
    version: 'v',
    serial: 's',
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshStatuses (:9080-9096)', () => {
  it('fetches /status/{statusKey} for all five exchanges in parallel', async () => {
    await refreshStatuses();
    expect(calls.map((c) => c.url)).toEqual([
      'http://pbgui.test:8000/api/market-data/status/hyperliquid',
      'http://pbgui.test:8000/api/market-data/status/binanceusdm',
      'http://pbgui.test:8000/api/market-data/status/bybit',
      'http://pbgui.test:8000/api/market-data/status/bitget',
      'http://pbgui.test:8000/api/market-data/status/okx',
    ]);
  });

  it('annotates each payload with the label and ui key (:9084-9085)', async () => {
    const summaries = await refreshStatuses();
    expect(summaries).toHaveLength(5);
    expect(summaries[1]).toMatchObject({ exchange: 'Binance USDM', uiExchange: 'binance' });
    expect(summaries[4]).toMatchObject({ exchange: 'OKX', uiExchange: 'okx' });
  });

  it('does not mutate the server payload (immutability deviation)', async () => {
    let seen: Record<string, unknown> | undefined;
    fetchMock.mockImplementation(async () => {
      const payload: Record<string, unknown> = { running: false };
      seen = payload;
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const summaries = await refreshStatuses();
    expect(seen).toEqual({ running: false });
    expect((summaries[0] as Record<string, unknown>).exchange).toBe('Hyperliquid');
  });

  it('maps a failed exchange to an error entry instead of rejecting (:9087-9093)', async () => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      if (String(url).endsWith('/status/bybit')) {
        return new Response('nope', { status: 500 });
      }
      return new Response('{"ok":true}', { status: 200 });
    });
    const summaries = await refreshStatuses();
    expect(summaries).toHaveLength(5);
    const bybit = summaries.find((s) => s.uiExchange === 'bybit');
    expect(bybit).toMatchObject({ exchange: 'Bybit', uiExchange: 'bybit' });
    expect(typeof bybit?.error).toBe('string');
    expect(bybit?.error).toBe('HTTP 500');
    expect(summaries.filter((s) => s.error)).toHaveLength(1);
  });

  it('falls back to market.statusFetchFailed when the error has no message', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('');
    });
    const summaries = await refreshStatuses();
    expect(summaries.every((s) => s.error === 'Status fetch failed')).toBe(true);
  });
});

describe('useStatusSummaries (bootstrap store :9095, call :9772)', () => {
  it('starts empty and stores the refresh result', async () => {
    const summaries = useStatusSummaries();
    expect(summaries.statusSummaries.value).toEqual([]);
    await summaries.refreshStatuses();
    expect(summaries.statusSummaries.value).toHaveLength(5);
  });
});
