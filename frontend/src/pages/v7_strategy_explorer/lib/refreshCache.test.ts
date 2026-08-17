import { describe, expect, it } from 'vitest';
import {
  cachedSnapshotOptions,
  containsSensitiveRefreshKey,
  readStrategyRefreshState,
  refreshCacheConfig,
  refreshCacheMovieData,
} from './refreshCache';
import type { MovieData, RefreshCachePayload } from '../types';

/* v8-only sessionStorage refresh cache — ports of :732-836. */

describe('containsSensitiveRefreshKey (:732-740)', () => {
  it('detects sensitive keys at any depth, normalizing spaces/dashes', () => {
    expect(containsSensitiveRefreshKey({ api_key: 'x' })).toBe(true);
    expect(containsSensitiveRefreshKey({ nested: { 'my secret-token': 1 } })).toBe(true);
    expect(containsSensitiveRefreshKey({ passwordHash: 'h' })).toBe(false);
    expect(containsSensitiveRefreshKey({ ok: 1, list: [{ session: 2 }] })).toBe(true);
  });

  it('ignores primitives and empty input', () => {
    expect(containsSensitiveRefreshKey(null)).toBe(false);
    expect(containsSensitiveRefreshKey('str')).toBe(false);
    expect(containsSensitiveRefreshKey({ safe: 'value' })).toBe(false);
  });
});

describe('refreshCacheConfig (:741-748)', () => {
  it('keeps only the non-sensitive top-level keys (v8 only)', () => {
    const config = {
      config_version: 2,
      backtest: { starting_balance: 100 },
      bot: { long: {} },
      live: {},
      coin_overrides: {},
      optimize: { bounds: {} },
      pbgui: { note: 'leak-me-not' },
    };
    const stored = refreshCacheConfig('v8', config);
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!).sort()).toEqual(['backtest', 'bot', 'coin_overrides', 'config_version', 'live']);
  });

  it('returns null on the v7 flavour, for non-objects and for sensitive configs', () => {
    expect(refreshCacheConfig('v7', { backtest: {} })).toBeNull();
    expect(refreshCacheConfig('v8', null)).toBeNull();
    expect(refreshCacheConfig('v8', [1, 2] as unknown as Parameters<typeof refreshCacheConfig>[1])).toBeNull();
    expect(refreshCacheConfig('v8', { backtest: {}, api_key: 'k' })).toBeNull();
    expect(refreshCacheConfig('v8', {})).toBeNull();
  });
});

describe('refreshCacheMovieData (:774-793)', () => {
  it('whitelists movie metadata fields and requires frames (v8 only)', () => {
    expect(refreshCacheMovieData('v7', { frames: [{} as never] })).toBeNull();
    expect(refreshCacheMovieData('v8', { frames: [] as never[] })).toBeNull();
    const data: MovieData = {
      ok: true,
      engine: 'pb8_engine',
      message: 'm',
      metadata: { exchange: 'binance', coin: 'BTC', step_mins: 240, fills_truncated: true },
      events: { long: [], short: [] },
      frames: [{ timestamp: '2024-01-01T00:00:00Z' }],
    };
    const cached = refreshCacheMovieData('v8', data)!;
    expect(cached.ok).toBe(true);
    expect(cached.engine).toBe('pb8_engine');
    expect(cached.metadata!.fills_truncated).toBe(true);
    expect(cached.metadata!.orders_available).toBe(false);
    expect(cached.frames).toHaveLength(1);
  });
});

describe('readStrategyRefreshState (:817-827)', () => {
  function storeWith(payload: unknown): Storage {
    const map = new Map<string, string>([['k', JSON.stringify(payload)]]);
    return {
      get length() { return map.size; },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: () => null,
      removeItem: (k: string) => void map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  }

  it('round-trips a fresh, non-sensitive payload', () => {
    const payload: RefreshCachePayload = {
      saved_at: Date.now(),
      config: { backtest: {} },
      controls: { stage: 'movie', exchange: 'binance' },
      movie_data: null,
    };
    expect(readStrategyRefreshState('k', storeWith(payload), Date.now())).toEqual(payload);
  });

  it('rejects missing, sensitive, and stale (24h) payloads', () => {
    expect(readStrategyRefreshState('k', storeWith(null), Date.now())).toBeNull();
    expect(readStrategyRefreshState('missing', storeWith({ saved_at: 0 }), Date.now())).toBeNull();
    const sensitive = { saved_at: Date.now(), config: { token: 'x' }, controls: {}, movie_data: null };
    expect(readStrategyRefreshState('k', storeWith(sensitive), Date.now())).toBeNull();
    const stale = { saved_at: Date.now() - 25 * 60 * 60 * 1000, config: { backtest: {} }, controls: {}, movie_data: null };
    expect(readStrategyRefreshState('k', storeWith(stale), Date.now())).toBeNull();
  });

  it('tolerates corrupt JSON', () => {
    const map = new Map<string, string>([['k', '{not json']]);
    const bad: Storage = { ...storeWith(null), getItem: () => '{not json' } as Storage;
    void map;
    expect(readStrategyRefreshState('k', bad, Date.now())).toBeNull();
  });
});

describe('cachedSnapshotOptions (:828-836)', () => {
  it('builds numeric snapshot options from cached controls', () => {
    const opts = cachedSnapshotOptions({
      controls: { exchange: 'binance', coin: 'BTC', start_date: '2024-01-01', start_time: '09:30', balance: '2500', reference_price: '42', context_days: '7' },
    });
    expect(opts).toEqual({
      exchange: 'binance',
      coin: 'BTC',
      start_date: '2024-01-01',
      start_time: '09:30',
      balance: 2500,
      reference_price: 42,
      context_days: 7,
      load_candles: true,
    });
  });

  it('defaults missing control values', () => {
    expect(cachedSnapshotOptions({})).toEqual({
      exchange: '',
      coin: '',
      start_date: '',
      start_time: '00:00',
      balance: 1000,
      reference_price: 100,
      context_days: 5,
      load_candles: true,
    });
  });
});
