import type {
  ExplorerOptions,
  MovieData,
  RefreshCachePayload,
  RefreshControls,
  StrategyConfig,
} from '../types';

/** Sensitive-key detector for the v8 refresh cache (:732-740). */
export function containsSensitiveRefreshKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSensitiveRefreshKey);
  return Object.keys(value).some((key) => {
    const normalized = String(key || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (/(^|_)(password|passwd|secret|token|api_key|private_key|credential|session)($|_)/.test(normalized)) return true;
    return containsSensitiveRefreshKey((value as Record<string, unknown>)[key]);
  });
}

const REFRESH_CONFIG_KEYS = ['config_version', 'backtest', 'bot', 'live', 'coin_overrides'];

/** Whitelist config projection for the cache (:741-748) — v8 only. */
export function refreshCacheConfig(
  flavor: 'v7' | 'v8',
  config: StrategyConfig | null | undefined
): StrategyConfig | null {
  if (flavor !== 'v8' || !config || typeof config !== 'object' || Array.isArray(config) || containsSensitiveRefreshKey(config))
    return null;
  const stored: Record<string, unknown> = {};
  for (const key of REFRESH_CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(config, key)) stored[key] = JSON.parse(JSON.stringify(config[key]));
  }
  return Object.keys(stored).length ? (stored as StrategyConfig) : null;
}

/** Movie metadata whitelist for the cache (:774-793) — v8 only. */
export function refreshCacheMovieData(flavor: 'v7' | 'v8', data: MovieData | null): MovieData | null {
  if (flavor !== 'v8' || !data || !Array.isArray(data.frames) || !data.frames.length) return null;
  const metadata = data.metadata || {};
  return {
    ok: data.ok !== false,
    engine: data.engine || 'pb8_engine',
    message: data.message || '',
    metadata: {
      exchange: metadata.exchange || '',
      coin: metadata.coin || '',
      engine: metadata.engine || '',
      start_time: metadata.start_time || '',
      step_mins: metadata.step_mins || 0,
      start_timestamp_ms: metadata.start_timestamp_ms || 0,
      end_timestamp_ms: metadata.end_timestamp_ms || 0,
      displayed_fill_count: metadata.displayed_fill_count || 0,
      total_fill_count: metadata.total_fill_count || 0,
      fills_truncated: metadata.fills_truncated === true,
      displayed_fill_end_timestamp_ms: metadata.displayed_fill_end_timestamp_ms || 0,
      orders_available: metadata.orders_available === true,
    },
    events: data.events || { long: [], short: [] },
    frames: data.frames,
  };
}

/** 24 h cache lifetime (:822). */
export const REFRESH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Read and validate the cached refresh state (:817-827). `storage` defaults
 * to window.sessionStorage; `now` is injectable for tests.
 */
export function readStrategyRefreshState(
  key: string,
  storage: Storage | null | undefined = typeof window === 'undefined' ? undefined : window.sessionStorage,
  now: number = Date.now()
): RefreshCachePayload | null {
  if (!storage) return null;
  try {
    const cached = JSON.parse(storage.getItem(key) || 'null') as RefreshCachePayload | null;
    if (!cached || !cached.config || containsSensitiveRefreshKey(cached.config)) return null;
    if (now - Number(cached.saved_at || 0) > REFRESH_CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

/** Options for the snapshot fetch that revalidates a cached config (:828-836). */
export function cachedSnapshotOptions(cached: { controls?: RefreshControls }): ExplorerOptions {
  const controls = cached && cached.controls ? cached.controls : {};
  return {
    exchange: controls.exchange || '',
    coin: controls.coin || '',
    start_date: controls.start_date || '',
    start_time: controls.start_time || '00:00',
    balance: Number(controls.balance || 1000),
    reference_price: Number(controls.reference_price || 100),
    context_days: Number(controls.context_days || 5),
    load_candles: true,
  };
}
