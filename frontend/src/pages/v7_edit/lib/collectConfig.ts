import type { EditAdapter } from '../config';
import type { EditFormState, ExtraLiveField } from './formModel';
import { collectApprovedCoinsValue, getOptionalNum, intVal, numVal } from './formModel';

/**
 * collectConfig — the port of v7_edit.html:2696-2905. Starts from the raw
 * JSON text as base (preserving unknown keys), overlays every structured
 * field from the form state, then applies the v8 managed-key projections.
 * The legacy file is the spec — coercion functions mirror getNum/getInt/
 * getChk/getOptionalNum exactly.
 */

export interface CollectContext {
  readonly adapter: EditAdapter;
  /** The loaded config (bot JSON fallback + starting_config + coin_overrides). */
  readonly cfg: Record<string, unknown>;
  readonly extraLive: readonly ExtraLiveField[];
  /** v8 managed key sets (resolveManagedKeys). */
  readonly managed: { live: readonly string[]; logging: readonly string[]; monitor: readonly string[] };
  /** coinOvCollect() equivalent — the coin-overrides panel snapshot (M-v7-2). */
  readonly coinOverrides?: Record<string, unknown>;
  /** _fromBacktestConfig (:1236). */
  readonly fromBacktestConfig?: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseJsonOr<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** The Additional Parameters collector (:2734-2754). */
export function collectExtraLive(fields: readonly ExtraLiveField[]): Record<string, unknown> {
  const extraLive: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === 'boolean') {
      extraLive[field.key] = field.checked;
    } else if (field.kind === 'number') {
      const parsed = parseFloat(field.text);
      extraLive[field.key] = Number.isNaN(parsed) ? field.text : parsed;
    } else if (field.kind === 'json') {
      extraLive[field.key] = parseJsonOr<unknown>(field.text, field.text);
    } else if (field.kind === 'null') {
      const raw = field.text.trim();
      if (raw === '' || raw === 'null') extraLive[field.key] = null;
      else extraLive[field.key] = parseJsonOr<unknown>(raw, raw);
    } else {
      extraLive[field.key] = field.text;
    }
  }
  return extraLive;
}

export function collectConfig(state: EditFormState, ctx: CollectContext): Record<string, unknown> {
  const adapter = ctx.adapter;

  // Base from the raw JSON text (:2697-2702) — unknown top-level keys survive.
  const base = state.rawJson.trim() ? parseJsonOr<Record<string, unknown>>(state.rawJson, {}) : {};

  // Bot JSON: textareas are the source of truth, TWE/npos from inputs (:2704-2712).
  const loadedBot = object(ctx.cfg.bot);
  const longJson = parseJsonOr<Record<string, unknown>>(state.longJson, object(loadedBot.long));
  const shortJson = parseJsonOr<Record<string, unknown>>(state.shortJson, object(loadedBot.short));
  adapter.setBotValue(longJson, 'total_wallet_exposure_limit', numVal(state.longTwe));
  adapter.setBotValue(longJson, 'n_positions', numVal(state.longNpos));
  adapter.setBotValue(shortJson, 'total_wallet_exposure_limit', numVal(state.shortTwe));
  adapter.setBotValue(shortJson, 'n_positions', numVal(state.shortNpos));

  // Coins: ignored wins over approved (:2718-2726).
  const approvedLong = state.approvedLong.filter((coin) => !state.ignoredLong.includes(coin));
  const approvedShort = state.approvedShort.filter((coin) => !state.ignoredShort.includes(coin));
  const ignoredLong = state.ignoredLong.slice();
  const ignoredShort = state.ignoredShort.slice();
  const approvedCoins = collectApprovedCoinsValue(approvedLong, approvedShort);

  const balOverride = numVal(state.balOverride);
  const startupPhaseBudgets = parseJsonOr<Record<string, unknown>>(state.startupPhaseBudgets, {});
  const liveEventDebugProfiles = parseJsonOr<unknown[]>(state.logDebugProfiles, []);

  const extraLive = collectExtraLive(ctx.extraLive);

  const baseLive = object(base.live);
  const baseLogging = object(base.logging);
  const baseMonitor = object(base.monitor);
  const basePbgui = object(base.pbgui);
  const baseBot = object(base.bot);
  const asObject = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const baseBacktest = asObject(base.backtest) ?? object(ctx.cfg.backtest);
  const baseOptimize = asObject(base.optimize) ?? object(ctx.cfg.optimize);

  const result: Record<string, unknown> = Object.assign({}, base, {
    live: Object.assign({}, baseLive, extraLive, {
      user: state.user,
      leverage: numVal(state.leverage),
      margin_mode_preference: state.marginMode,
      minimum_coin_age_days: numVal(state.minCoinAge),
      pnls_max_lookback_days: numVal(state.pnlsLookback),
      warmup_ratio: numVal(state.warmupRatio),
      max_realized_loss_pct: numVal(state.maxLossPct),
      initial_entry_exec_max_market_dist_pct: numVal(state.priceDist),
      execution_delay_seconds: numVal(state.execDelay),
      market_order_near_touch_threshold: numVal(state.marketOrderThreshold),
      filter_by_min_effective_cost: state.filterMinCost,
      market_orders_allowed: state.marketOrders,
      auto_gs: state.autoGs,
      hedge_mode: state.hedgeMode,
      approved_coins: approvedCoins,
      ignored_coins: { long: ignoredLong, short: ignoredShort },
      max_n_cancellations_per_batch: intVal(state.maxCancel),
      max_n_creations_per_batch: intVal(state.maxCreate),
      fills_recent_overlap_minutes: numVal(state.fillsRecentOverlap),
      fills_confirmation_overlap_minutes: numVal(state.fillsConfirmOverlap),
      forced_mode_long: state.forcedLong,
      forced_mode_short: state.forcedShort,
      hsl_signal_mode: state.hslSignalMode,
      hsl_position_during_cooldown_policy: state.hslCooldownPolicy,
      max_n_restarts_per_day: intVal(state.maxRestarts),
      max_disk_candles_per_symbol_per_tf: intVal(state.maxDiskCandles),
      max_memory_candles_per_symbol: intVal(state.maxMemCandles),
      time_in_force: state.timeInForce,
      inactive_coin_candle_ttl_minutes: numVal(state.inactiveTtl),
      recv_window_ms: intVal(state.recvWindow),
      order_match_tolerance_pct: numVal(state.orderMatchTol),
      balance_override: balOverride > 0 ? balOverride : null,
      balance_hysteresis_snap_pct: numVal(state.balHyst),
      warmup_jitter_seconds: numVal(state.warmupJitter),
      warmup_concurrency: intVal(state.warmupConc),
      max_warmup_minutes: intVal(state.maxWarmupMin),
      max_concurrent_api_requests: getOptionalNum(state.maxApiReq),
      defer_broad_candle_warmup: state.deferBroadCandleWarmup,
      candle_lock_timeout_seconds: intVal(state.candleLock),
      enable_archive_candle_fetch: state.archiveFetch,
      max_ohlcv_fetches_per_minute: intVal(state.maxOhlcvFetches),
      market_snapshot_ticker_strategy: state.marketSnapshotStrategy,
      max_active_candle_tail_gap_minutes: intVal(state.maxActiveTailGap),
      max_forager_candle_staleness_minutes: getOptionalNum(state.maxForagerStale),
      max_forager_candle_refresh_seconds: intVal(state.maxForagerRefresh),
      forager_score_hysteresis_pct: numVal(state.foragerHysteresis),
    }),
    logging: Object.assign({}, baseLogging, {
      level: intVal(state.loggingLevel),
      memory_snapshot_interval_minutes: intVal(state.memSnapshot),
      volume_refresh_info_threshold_seconds: intVal(state.volRefresh),
    }),
    monitor: baseMonitor,
    pbgui: Object.assign({}, basePbgui, {
      version: intVal(state.version),
      enabled_on: state.enabledOn || 'disabled',
      note: state.note,
      market_cap: intVal(state.marketCap),
      vol_mcap: numVal(state.volMcap),
      tags: state.tags.slice(),
      only_cpt: state.onlyCpt,
      notices_ignore: state.noticesIgnore,
      dynamic_ignore: state.dynamicIgnore,
      starting_config: object(ctx.cfg.pbgui).starting_config || false,
      from_backtest_config: ctx.fromBacktestConfig || undefined,
    }),
    bot: Object.assign({}, baseBot, { long: longJson, short: shortJson }),
    coin_overrides: ctx.coinOverrides ?? object(ctx.cfg.coin_overrides),
    backtest: baseBacktest,
    optimize: baseOptimize,
  });

  if (adapter.isV8) {
    // v8: only user/strategy_kind/coins + runtime-declared managed keys (:2837-2903)
    const structuredLive = Object.assign({}, object(result.live), {
      custom_endpoints_path: state.customEndpointsPath.trim() || null,
      enable_forager_ws_candles: state.enableForagerWs,
      exchange_symbol_unavailable_cooldown_hours: numVal(state.exchangeSymbolCooldown),
      fee_conversion_max_age_ms: intVal(state.feeConversionAge),
      fee_pct_fallback: numVal(state.feePctFallback),
      fee_pct_sanity_abs_max: numVal(state.feePctSanity),
      forager_ws_candle_rest_audit_minutes: numVal(state.foragerWsAudit),
      force_cold_startup: state.forceColdStartup,
      hsl_accept_incomplete_history: state.hslAcceptIncomplete,
      order_replacement_churn_gate_activation_count: intVal(state.churnActivationCount),
      order_replacement_churn_gate_market_dist_pct: numVal(state.churnMarketDist),
      order_replacement_churn_gate_stability_minutes: numVal(state.churnStabilityMinutes),
      order_replacement_churn_gate_window_minutes: numVal(state.churnWindowMinutes),
      startup_phase_budgets: startupPhaseBudgets
    });
    const resultLive = Object.assign({}, baseLive, extraLive, {
      user: state.user,
      strategy_kind: state.strategyKind || baseLive.strategy_kind,
      approved_coins: approvedCoins,
      ignored_coins: { long: ignoredLong, short: ignoredShort }
    });
    for (const key of ctx.managed.live) {
      const value = adapter.managedLiveValue(key, structuredLive);
      if (value !== undefined) resultLive[key] = value;
    }
    result.live = resultLive;

    const structuredLogging = Object.assign({}, object(result.logging), {
      backup_count: intVal(state.logBackupCount),
      dir: state.logDir,
      live_event_debug_profiles: liveEventDebugProfiles,
      max_bytes_mb: numVal(state.logMaxBytes),
      persist_to_file: state.logPersist,
      rotation: state.logRotation
    });
    const resultLogging = Object.assign({}, baseLogging);
    for (const key of ctx.managed.logging) {
      resultLogging[key] = structuredLogging[key];
    }
    result.logging = resultLogging;

    const structuredMonitor: Record<string, unknown> = {
      checkpoint_interval_minutes: numVal(state.monitorCheckpoint),
      compress_rotated_segments: state.monitorCompress,
      emit_completed_candles: state.monitorEmitCandles,
      enabled: state.monitorEnabled,
      event_rotation_mb: numVal(state.monitorRotationMb),
      event_rotation_minutes: numVal(state.monitorRotationMinutes),
      include_raw_fill_payloads: state.monitorRawFills,
      max_total_bytes: intVal(state.monitorMaxBytes),
      price_tick_min_interval_ms: intVal(state.monitorPriceInterval),
      retain_candles: state.monitorRetainCandles,
      retain_days: numVal(state.monitorRetainDays),
      retain_fills: state.monitorRetainFills,
      retain_price_ticks: state.monitorRetainTicks,
      root_dir: state.monitorRootDir,
      snapshot_interval_seconds: numVal(state.monitorSnapshotInterval)
    };
    const resultMonitor = Object.assign({}, baseMonitor);
    for (const key of ctx.managed.monitor) {
      resultMonitor[key] = structuredMonitor[key];
    }
    result.monitor = resultMonitor;

    result.pbgui = Object.assign({}, object(result.pbgui), { runtime: 'pb8' });
    if (Object.prototype.hasOwnProperty.call(basePbgui, 'dynamic_ignore')) {
      object(result.pbgui).dynamic_ignore = basePbgui.dynamic_ignore;
    } else {
      delete object(result.pbgui).dynamic_ignore;
    }
  }
  return result;
}
