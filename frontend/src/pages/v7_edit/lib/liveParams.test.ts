import { describe, expect, it } from 'vitest';
import {
  SHARED_LIVE_FIELDS,
  SHARED_LOGGING_FIELDS,
  SHARED_MONITOR_FIELDS,
  V7_KNOWN_LIVE_PARAMS,
  buildKnownLiveParams,
  resolveManagedKeys,
} from './liveParams';

/*
 * KNOWN_LIVE_PARAMS and the v8 runtime-metadata field maps — ports of
 * v7_edit.html:1263-1283 and run_editor_adapter.js:23-96/:182-204 minus the
 * DOM show/hide half (the Vue form derives visibility from the same data).
 */

describe('V7_KNOWN_LIVE_PARAMS (:1263-1281)', () => {
  it('is the exact legacy v7 list', () => {
    expect([...V7_KNOWN_LIVE_PARAMS]).toEqual([
      'user', 'leverage', 'margin_mode_preference',
      'minimum_coin_age_days', 'pnls_max_lookback_days', 'warmup_ratio', 'max_realized_loss_pct',
      'initial_entry_exec_max_market_dist_pct', 'execution_delay_seconds', 'market_order_near_touch_threshold',
      'filter_by_min_effective_cost', 'market_orders_allowed', 'auto_gs', 'hedge_mode',
      'approved_coins', 'ignored_coins',
      'max_n_cancellations_per_batch', 'max_n_creations_per_batch',
      'forced_mode_long', 'forced_mode_short', 'hsl_signal_mode', 'hsl_position_during_cooldown_policy',
      'max_n_restarts_per_day', 'max_disk_candles_per_symbol_per_tf', 'max_memory_candles_per_symbol',
      'time_in_force', 'inactive_coin_candle_ttl_minutes', 'recv_window_ms',
      'order_match_tolerance_pct', 'balance_override', 'balance_hysteresis_snap_pct',
      'warmup_jitter_seconds', 'warmup_concurrency', 'max_warmup_minutes',
      'max_concurrent_api_requests', 'candle_lock_timeout_seconds',
      'enable_archive_candle_fetch', 'max_ohlcv_fetches_per_minute',
      'defer_broad_candle_warmup', 'fills_recent_overlap_minutes', 'fills_confirmation_overlap_minutes',
      'market_snapshot_ticker_strategy', 'max_active_candle_tail_gap_minutes',
      'max_forager_candle_staleness_minutes', 'max_forager_candle_refresh_seconds',
      'forager_score_hysteresis_pct',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(V7_KNOWN_LIVE_PARAMS).size).toBe(V7_KNOWN_LIVE_PARAMS.length);
  });
});

describe('buildKnownLiveParams (:1282-1283, :1804-1807)', () => {
  it('v7 seeds from the v7 list', () => {
    const known = buildKnownLiveParams('v7', []);
    expect(known.has('user')).toBe(true);
    expect(known.has('strategy_kind')).toBe(false);
  });

  it('v8 seeds from the adapter list plus strategy_kind', () => {
    const known = buildKnownLiveParams('v8', []);
    expect(known.has('user')).toBe(true);
    expect(known.has('approved_coins')).toBe(true);
    expect(known.has('ignored_coins')).toBe(true);
    expect(known.has('strategy_kind')).toBe(true);
    expect(known.has('leverage')).toBe(false);
  });

  it('flips KNOWN_LIVE_PARAMS when managed keys arrive (metadata flow)', () => {
    const known = buildKnownLiveParams('v8', ['leverage', 'recv_window_ms']);
    expect(known.has('leverage')).toBe(true);
    expect(known.has('recv_window_ms')).toBe(true);
    expect(known.has('market_snapshot_ticker_strategy')).toBe(false);
  });
});

describe('resolveManagedKeys (configureRuntimeMetadata :182-204, DOM-free)', () => {
  it('keeps only fields the v8 runtime declares (params.live ownership)', () => {
    const managed = resolveManagedKeys(
      {
        params: {
          live: { leverage: {}, margin_mode_preference: {}, not_a_form_field: {}, recv_window_ms: {} },
          logging: {},
          monitor: {},
        },
      },
      'v8'
    );
    expect(managed.live).toEqual(['leverage', 'margin_mode_preference', 'recv_window_ms']);
    expect(managed.logging).toEqual([]);
    expect(managed.monitor).toEqual([]);
  });

  it('orders managed keys by the legacy field-map declaration order', () => {
    const managed = resolveManagedKeys(
      {
        params: {
          live: { recv_window_ms: {}, leverage: {}, market_orders_allowed: {} },
          logging: { level: {}, rotation: {}, backup_count: {} },
          monitor: { enabled: {}, root_dir: {} },
        },
      },
      'v8'
    );
    expect(managed.live).toEqual(['leverage', 'market_orders_allowed', 'recv_window_ms']);
    expect(managed.logging).toEqual(['level', 'backup_count', 'rotation']);
    expect(managed.monitor).toEqual(['enabled', 'root_dir']);
  });

  it('returns every shared live field for v7 (early return :183)', () => {
    const managed = resolveManagedKeys({}, 'v7');
    expect(managed.live).toEqual(Object.keys(SHARED_LIVE_FIELDS));
    expect(managed.logging).toEqual([]);
    expect(managed.monitor).toEqual([]);
  });

  it('ignores non-object metadata shapes', () => {
    const managed = resolveManagedKeys({ params: null }, 'v8');
    expect(managed).toEqual({ live: [], logging: [], monitor: [] });
  });
});

describe('field maps', () => {
  it('carry the legacy field ids (spot parity with run_editor_adapter.js:23-75)', () => {
    expect(SHARED_LIVE_FIELDS.leverage).toBe('f-leverage');
    expect(SHARED_LIVE_FIELDS.limit_order_create_max_market_dist_pct).toBe('f-price-dist');
    expect(SHARED_LIVE_FIELDS.startup_phase_budgets).toBe('f-startup-phase-budgets');
    expect(SHARED_LOGGING_FIELDS.level).toBe('f-logging-level');
    expect(SHARED_MONITOR_FIELDS.enabled).toBe('f-monitor-enabled');
  });
});
