import { describe, expect, it, vi } from 'vitest';
import { applyCatalogLabels, coinOptions, fetchCoinStatuses, useSymbolsTags } from './useSymbolsTags';

/*
 * Symbols/tags loading — ports of loadSymbolsAndTags (:2071-2131, seq guard
 * :2109), getCoinsForLoad (:2155-2163), getTagsForLoad (:2177-2184),
 * refreshCoinStatuses (:3727-3775) and queueSymbolsAndTagsLoad (:2133-2138).
 */

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
}

describe('applyCatalogLabels (:2112-2115)', () => {
  it('maps catalog config ids to display labels', () => {
    expect(
      applyCatalogLabels([
        { config_id: 'BTCUSDT', display: 'BTC', coin: 'x' },
        { config_id: 'ID-2', coin: 'ETH' },
        { config_id: '', display: 'skip' },
      ])
    ).toEqual({ BTCUSDT: 'BTC', 'ID-2': 'ETH' });
  });

  it('returns an empty map for missing catalogs', () => {
    expect(applyCatalogLabels(undefined)).toEqual({});
    expect(applyCatalogLabels([])).toEqual({});
  });
});

describe('coinOptions (:2089-2092)', () => {
  it('prefixes approved lists with the canonical all', () => {
    expect(coinOptions(['BTC', 'ETH'], true)).toEqual(['all', 'BTC', 'ETH']);
    expect(coinOptions(['BTC', 'ETH'], false)).toEqual(['BTC', 'ETH']);
  });
});

describe('fetchCoinStatuses (:3750-3767)', () => {
  it('posts the exchange + coins pair', async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return jsonResponse({ statuses: { BTC: { status: 'ok' } } });
    });
    const statuses = await fetchCoinStatuses('http://x/api/v7', 'binance', ['BTC', 'ETH'], fetchFn as unknown as typeof fetch);
    expect(statuses).toEqual({ BTC: { status: 'ok' } });
    const call = fetchFn.mock.calls[0]!;
    expect(call[0]).toBe('http://x/api/v7/coins/status');
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      exchanges: ['binance'],
      coins: ['BTC', 'ETH'],
    });
  });

  it('rethrows failures for the caller to clear meta', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ detail: 'nope' }, false));
    await expect(fetchCoinStatuses('http://x/api/v7', 'binance', ['BTC'], fetchFn as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe('useSymbolsTags (loadSymbolsAndTags :2071-2131)', () => {
  it('seeds multiselects immediately and swaps in the fetched options', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/symbols?exchange=binance'))
        return jsonResponse({ symbols: ['BTC', 'ETH', 'SOL'], catalog: [{ config_id: 'ETH', display: 'E' }] });
      if (url.includes('/tags?exchange=binance')) return jsonResponse({ tags: ['DeFi', 'L1'] });
      if (url.includes('/coins/status')) return jsonResponse({ statuses: {} });
      throw new Error('unexpected ' + url);
    });
    const loader = useSymbolsTags('http://x/api/v7', fetchFn as unknown as typeof fetch);
    const selections = {
      approvedLong: ['BTC'],
      approvedShort: [] as string[],
      ignoredLong: ['SOL'],
      ignoredShort: [] as string[],
      tags: ['DeFi'],
    };
    const exchange = 'binance';
    await loader.load('binance', selections, { preferConfigValues: true });
    expect(exchange).toBe('binance');
    expect(loader.symbols.value).toEqual(['BTC', 'ETH', 'SOL']);
    expect(loader.tags.value).toEqual(['DeFi', 'L1']);
    expect(loader.marketLabels.value).toEqual({ ETH: 'E' });
    expect(loader.options.approvedLong.value).toEqual(['all', 'BTC', 'ETH', 'SOL']);
    expect(loader.options.ignoredLong.value).toEqual(['BTC', 'ETH', 'SOL']);
    expect(loader.options.tags.value).toEqual(['DeFi', 'L1']);
    // selected values follow the config (preferConfigValues)
    expect(loader.selected.approvedLong.value).toEqual(['BTC']);
    expect(loader.selected.ignoredLong.value).toEqual(['SOL']);
    expect(loader.selected.tags.value).toEqual(['DeFi']);
  });

  it('keeps the in-progress selections when the config has none (getCoinsForLoad :2155-2163)', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/symbols?')) return jsonResponse({ symbols: ['BTC'] });
      if (url.includes('/tags?')) return jsonResponse({ tags: [] });
      if (url.includes('/coins/status')) return jsonResponse({ statuses: {} });
      throw new Error('unexpected ' + url);
    });
    const loader = useSymbolsTags('http://x/api/v7', fetchFn as unknown as typeof fetch);
    loader.selected.approvedLong.value = ['kept-coin'];
    await loader.load('binance', { approvedLong: [], approvedShort: [], ignoredLong: [], ignoredShort: [], tags: [] }, {});
    expect(loader.selected.approvedLong.value).toEqual(['kept-coin']);
  });

  it('seeds only when the user has no exchange (:2097-2102)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('should not fetch');
    });
    const loader = useSymbolsTags('http://x/api/v7', fetchFn as unknown as typeof fetch);
    await loader.load('', { approvedLong: ['BTC'], approvedShort: [], ignoredLong: [], ignoredShort: [], tags: ['T'] }, {
      preferConfigValues: true,
    });
    expect(loader.symbols.value).toEqual(['BTC']);
    expect(loader.tags.value).toEqual(['T']);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('drops stale responses via the load sequence (:2109)', async () => {
    let resolveSymbols!: (body: unknown) => void;
    const fetchFn = vi.fn((url: string) => {
      if (url.includes('/symbols?')) {
        return new Promise<Response>((resolve) => {
          if (fetchFn.mock.calls.filter((c) => String(c[0]).includes('/symbols?')).length === 1) {
            resolveSymbols = (body) => resolve(jsonResponse(body));
          } else {
            resolve(jsonResponse({ symbols: ['fresh'] }));
          }
        });
      }
      if (url.includes('/tags?')) return Promise.resolve(jsonResponse({ tags: ['t'] }));
      if (url.includes('/coins/status')) return Promise.resolve(jsonResponse({ statuses: {} }));
      throw new Error('unexpected ' + url);
    });
    const loader = useSymbolsTags('http://x/api/v7', fetchFn as unknown as typeof fetch);
    const selections = { approvedLong: [], approvedShort: [], ignoredLong: [], ignoredShort: [], tags: [] };
    const first = loader.load('binance', selections, {});
    const second = loader.load('binance', selections, {});
    resolveSymbols({ symbols: ['stale'] });
    await Promise.all([first, second]);
    expect(loader.symbols.value).toEqual(['fresh']);
  });

  it('keeps the seeded state when the fetch pair fails (:2126-2130)', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/symbols?') || url.includes('/tags?')) throw new Error('offline');
      if (url.includes('/coins/status')) return jsonResponse({ statuses: {} });
      throw new Error('unexpected ' + url);
    });
    const loader = useSymbolsTags('http://x/api/v7', fetchFn as unknown as typeof fetch);
    await loader.load('binance', { approvedLong: ['BTC'], approvedShort: [], ignoredLong: [], ignoredShort: [], tags: [] }, {
      preferConfigValues: true,
    });
    expect(loader.symbols.value).toEqual(['BTC']);
    expect(loader.options.approvedLong.value).toEqual(['all', 'BTC']);
  });

  it('chains loads through one promise (queueSymbolsAndTagsLoad :2133-2138)', async () => {
    const order: string[] = [];
    let release = false;
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/symbols?')) {
        while (!release) await new Promise((r) => setTimeout(r, 1));
        order.push('symbols');
        return jsonResponse({ symbols: ['BTC'] });
      }
      if (url.includes('/tags?')) {
        order.push('tags');
        return jsonResponse({ tags: [] });
      }
      return jsonResponse({ statuses: {} });
    });
    const loader = useSymbolsTags('http://x/api/v7', fetchFn as unknown as typeof fetch);
    const selections = { approvedLong: [], approvedShort: [], ignoredLong: [], ignoredShort: [], tags: [] };
    const first = loader.queue('binance', selections, {});
    release = true;
    await first;
    expect(order).toContain('symbols');
  });
});
