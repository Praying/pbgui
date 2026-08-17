import type { EditFlavor } from '../config';

/**
 * KNOWN_LIVE_PARAMS + the v8 runtime-metadata field maps — ports of
 * v7_edit.html:1263-1283 and run_editor_adapter.js:23-96 / :182-204. The
 * legacy DOM half of configureRuntimeMetadata (show/hide .run-version-hidden)
 * is replaced by the Vue form deriving visibility from the same maps.
 */

/** live.* keys handled by the GUI form or intentionally hidden/deprecated (:1263-1281). */
export const V7_KNOWN_LIVE_PARAMS: readonly string[] = [
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
];

/** Shared advanced live fields the PB8 runtime may declare (adapter :23-59). */
export const SHARED_LIVE_FIELDS: Readonly<Record<string, string>> = {
  leverage: 'f-leverage', margin_mode_preference: 'f-margin-mode',
  minimum_coin_age_days: 'f-min-coin-age', pnls_max_lookback_days: 'f-pnls-lookback',
  warmup_ratio: 'f-warmup-ratio', max_realized_loss_pct: 'f-max-loss-pct',
  initial_entry_exec_max_market_dist_pct: 'f-price-dist', execution_delay_seconds: 'f-exec-delay',
  limit_order_create_max_market_dist_pct: 'f-price-dist',
  market_order_near_touch_threshold: 'f-market-order-threshold',
  filter_by_min_effective_cost: 'f-filter-min-cost', market_orders_allowed: 'f-market-orders',
  hedge_mode: 'f-hedge-mode', auto_gs: 'f-auto-gs', forced_mode_long: 'f-forced-long',
  forced_mode_short: 'f-forced-short', hsl_signal_mode: 'f-hsl-signal-mode',
  hsl_position_during_cooldown_policy: 'f-hsl-cooldown-policy', time_in_force: 'f-time-in-force',
  max_n_cancellations_per_batch: 'f-max-cancel', max_n_creations_per_batch: 'f-max-create',
  max_n_restarts_per_day: 'f-max-restarts', recv_window_ms: 'f-recv-window',
  order_match_tolerance_pct: 'f-order-match-tol', fills_recent_overlap_minutes: 'f-fills-recent-overlap',
  fills_confirmation_overlap_minutes: 'f-fills-confirm-overlap', max_concurrent_api_requests: 'f-max-api-req',
  max_warmup_minutes: 'f-max-warmup-min', warmup_jitter_seconds: 'f-warmup-jitter',
  warmup_concurrency: 'f-warmup-conc', defer_broad_candle_warmup: 'f-defer-broad-candle-warmup',
  enable_archive_candle_fetch: 'f-archive-fetch', max_ohlcv_fetches_per_minute: 'f-max-ohlcv-fetches',
  candle_lock_timeout_seconds: 'f-candle-lock', market_snapshot_ticker_strategy: 'f-market-snapshot-strategy',
  forager_score_hysteresis_pct: 'f-forager-hysteresis',
  max_forager_candle_staleness_minutes: 'f-max-forager-stale',
  max_forager_candle_refresh_seconds: 'f-max-forager-refresh',
  max_disk_candles_per_symbol_per_tf: 'f-max-disk-candles',
  max_memory_candles_per_symbol: 'f-max-mem-candles', inactive_coin_candle_ttl_minutes: 'f-inactive-ttl',
  max_active_candle_tail_gap_minutes: 'f-max-active-tail-gap', balance_override: 'f-bal-override',
  balance_hysteresis_snap_pct: 'f-bal-hyst', custom_endpoints_path: 'f-custom-endpoints-path',
  enable_forager_ws_candles: 'f-enable-forager-ws', fee_conversion_max_age_ms: 'f-fee-conversion-age',
  exchange_symbol_unavailable_cooldown_hours: 'f-exchange-symbol-cooldown',
  fee_pct_fallback: 'f-fee-pct-fallback', fee_pct_sanity_abs_max: 'f-fee-pct-sanity',
  forager_ws_candle_rest_audit_minutes: 'f-forager-ws-audit', force_cold_startup: 'f-force-cold-startup',
  hsl_accept_incomplete_history: 'f-hsl-accept-incomplete',
  order_replacement_churn_gate_activation_count: 'f-churn-activation-count',
  order_replacement_churn_gate_market_dist_pct: 'f-churn-market-dist',
  order_replacement_churn_gate_stability_minutes: 'f-churn-stability-minutes',
  order_replacement_churn_gate_window_minutes: 'f-churn-window-minutes',
  startup_phase_budgets: 'f-startup-phase-budgets'
};

/** logging.* fields (adapter :60-65). */
export const SHARED_LOGGING_FIELDS: Readonly<Record<string, string>> = {
  level: 'f-logging-level', backup_count: 'f-log-backup-count', dir: 'f-log-dir',
  live_event_debug_profiles: 'f-log-debug-profiles', max_bytes_mb: 'f-log-max-bytes',
  memory_snapshot_interval_minutes: 'f-mem-snapshot', persist_to_file: 'f-log-persist',
  rotation: 'f-log-rotation', volume_refresh_info_threshold_seconds: 'f-vol-refresh'
};

/** monitor.* fields (adapter :66-75). */
export const SHARED_MONITOR_FIELDS: Readonly<Record<string, string>> = {
  checkpoint_interval_minutes: 'f-monitor-checkpoint', compress_rotated_segments: 'f-monitor-compress',
  emit_completed_candles: 'f-monitor-emit-candles', enabled: 'f-monitor-enabled',
  event_rotation_mb: 'f-monitor-rotation-mb', event_rotation_minutes: 'f-monitor-rotation-minutes',
  include_raw_fill_payloads: 'f-monitor-raw-fills', max_total_bytes: 'f-monitor-max-bytes',
  price_tick_min_interval_ms: 'f-monitor-price-interval', retain_candles: 'f-monitor-retain-candles',
  retain_days: 'f-monitor-retain-days', retain_fills: 'f-monitor-retain-fills',
  retain_price_ticks: 'f-monitor-retain-ticks', root_dir: 'f-monitor-root-dir',
  snapshot_interval_seconds: 'f-monitor-snapshot-interval'
};

export interface EditorMetadata {
  readonly strategies?: readonly unknown[];
  readonly strategy_defaults?: Record<string, Record<string, unknown>>;
  readonly params?: {
    readonly live?: Record<string, unknown>;
    readonly logging?: Record<string, unknown>;
    readonly monitor?: Record<string, unknown>;
  };
}

export interface ManagedKeys {
  readonly live: readonly string[];
  readonly logging: readonly string[];
  readonly monitor: readonly string[];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Port of configureRuntimeMetadata (:182-204) without the DOM half: v7 gets
 * the whole shared live list (legacy early return), v8 gets the keys the
 * runtime metadata declares, in field-map declaration order.
 */
export function resolveManagedKeys(metadata: unknown, flavor: EditFlavor): ManagedKeys {
  const params = object(object(metadata).params);
  const pick = (fields: Readonly<Record<string, string>>, available: Record<string, unknown>): string[] =>
    Object.keys(fields).filter((key) => Object.prototype.hasOwnProperty.call(available, key));
  if (flavor !== 'v8') {
    return { live: Object.keys(SHARED_LIVE_FIELDS), logging: [], monitor: [] };
  }
  return {
    live: pick(SHARED_LIVE_FIELDS, object(params.live)),
    logging: pick(SHARED_LOGGING_FIELDS, object(params.logging)),
    monitor: pick(SHARED_MONITOR_FIELDS, object(params.monitor)),
  };
}

/**
 * The KNOWN_LIVE_PARAMS set (:1282-1283 seeding + :1804-1807 metadata adds):
 * v7 seeds from the page list; v8 seeds from the adapter list, adds
 * strategy_kind, then the metadata-managed live keys.
 */
export function buildKnownLiveParams(
  flavor: EditFlavor,
  managedLiveKeys: readonly string[],
  adapterKnown: readonly string[] | null = null
): Set<string> {
  const seed =
    flavor === 'v8' ? (adapterKnown ?? ['user', 'approved_coins', 'ignored_coins']) : V7_KNOWN_LIVE_PARAMS;
  const known = new Set<string>(seed);
  if (flavor === 'v8') known.add('strategy_kind');
  for (const key of managedLiveKeys) known.add(key);
  return known;
}
