import type { EditAdapter } from '../config';
import type { ExtraLiveField, EditFormState } from './formModel';
import { createEmptyFormState, forcedModeSelectValue, getCoinSelectionValue, textVal } from './formModel';
import { selectStrategySideConfig, type ParamStatus, type StrategyCache } from './strategyKind';
import { createEmptyStrategyCache } from './strategyKind';

/**
 * populateForm — the port of v7_edit.html:2326-2578. The legacy function
 * wrote into the DOM by field id; this port writes the same values into a
 * plain EditFormState (same defaults, same || / !== false coercions — the
 * legacy file is the spec).
 */

export interface PopulateOptions {
  readonly adapter: EditAdapter;
  /** KNOWN_LIVE_PARAMS snapshot at populate time (flips extras detection). */
  readonly known: ReadonlySet<string>;
  readonly editorMetadata?: unknown;
  readonly paramStatus?: ParamStatus | Record<string, Record<string, string>>;
  readonly strategyCache?: StrategyCache;
  /** syncEditorFromParsed keeps the raw text (:2630). */
  readonly skipRawUpdate?: boolean;
  /** The raw text to keep when skipRawUpdate is set. */
  readonly rawJson?: string;
}

export interface PopulateResult {
  readonly state: EditFormState;
  /** Additional Parameters fields, sorted by key (:2482). */
  readonly extraLive: ExtraLiveField[];
  /** The config the page should keep (v8: bot sides strategy-extracted, :2457-2465). */
  readonly cfg: Record<string, unknown>;
  readonly rawJson: string;
  readonly paramStatus: ParamStatus;
  readonly activeStrategyKind: string;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numOf(value: unknown, fallback: number | ''): string {
  return value != null ? textVal(value) : String(fallback);
}

/** Legacy setVal(:2336-2449) row-by-row, in the legacy order. */
export function populateForm(cfgInput: unknown, opts: PopulateOptions): PopulateResult {
  const adapter = opts.adapter;
  const cfg = object(cfgInput);
  const live = object(cfg.live);
  const pbgui = object(cfg.pbgui);
  const logging = object(cfg.logging);
  const monitor = object(cfg.monitor);
  const bot = object(cfg.bot);
  const paramStatusIn = (opts.paramStatus ?? {}) as ParamStatus;

  const state = createEmptyFormState();

  // Row 1 (:2336-2350)
  state.user = textVal(live.user ?? '');
  state.strategyKind = textVal(live.strategy_kind ?? '');
  state.enabledOn = textVal(pbgui.enabled_on || 'disabled');
  state.version = numOf(pbgui.version, 0);
  state.leverage = numOf(live.leverage, 10);
  state.marginMode = textVal(live.margin_mode_preference || 'cross');
  state.loggingLevel = numOf(logging.level, 1);

  // Row 2 (:2353-2357)
  state.minCoinAge = numOf(live.minimum_coin_age_days, 0);
  state.pnlsLookback = numOf(live.pnls_max_lookback_days, 30);
  state.warmupRatio = numOf(live.warmup_ratio, 0);
  state.maxLossPct = numOf(live.max_realized_loss_pct, 1.0);
  state.note = textVal(pbgui.note ?? '');

  // Row 3 (:2360-2367)
  const entryDistance = adapter.readLiveValue(live, 'initial_entry_exec_max_market_dist_pct');
  state.priceDist = numOf(entryDistance, 0.005);
  state.execDelay = numOf(live.execution_delay_seconds, 2);
  state.marketOrderThreshold = numOf(live.market_order_near_touch_threshold, 0.001);
  state.filterMinCost = !!live.filter_by_min_effective_cost;
  state.marketOrders = live.market_orders_allowed !== false;
  state.hedgeMode = !!live.hedge_mode;
  state.autoGs = !!live.auto_gs;

  // Advanced (:2370-2439)
  state.maxCancel = numOf(live.max_n_cancellations_per_batch, 5);
  state.maxCreate = numOf(live.max_n_creations_per_batch, 3);
  state.forcedLong = forcedModeSelectValue(live.forced_mode_long, adapter.isV8);
  state.forcedShort = forcedModeSelectValue(live.forced_mode_short, adapter.isV8);
  state.hslSignalMode = textVal(live.hsl_signal_mode || 'unified');
  state.hslCooldownPolicy = textVal(live.hsl_position_during_cooldown_policy || 'panic');
  state.maxRestarts = numOf(live.max_n_restarts_per_day, 10);
  state.maxDiskCandles = numOf(live.max_disk_candles_per_symbol_per_tf, 1000000);
  state.maxMemCandles = numOf(live.max_memory_candles_per_symbol, 200000);
  state.timeInForce = textVal(live.time_in_force || 'good_till_cancelled');
  state.inactiveTtl = numOf(live.inactive_coin_candle_ttl_minutes, 10);
  state.recvWindow = numOf(live.recv_window_ms, 10000);
  state.orderMatchTol = numOf(live.order_match_tolerance_pct, 0.0002);
  state.fillsRecentOverlap = numOf(live.fills_recent_overlap_minutes, 10);
  state.fillsConfirmOverlap = numOf(live.fills_confirmation_overlap_minutes, 60);
  state.balHyst = numOf(live.balance_hysteresis_snap_pct, 0.02);
  state.balOverride = numOf(live.balance_override, 0);
  state.maxWarmupMin = numOf(live.max_warmup_minutes, 0);
  state.memSnapshot = numOf(logging.memory_snapshot_interval_minutes, 30);
  state.volRefresh = numOf(logging.volume_refresh_info_threshold_seconds, 30);
  state.warmupJitter = numOf(live.warmup_jitter_seconds, 0);
  state.warmupConc = numOf(live.warmup_concurrency, 0);
  state.deferBroadCandleWarmup = live.defer_broad_candle_warmup !== false;
  state.archiveFetch = !!live.enable_archive_candle_fetch;
  state.maxOhlcvFetches = numOf(live.max_ohlcv_fetches_per_minute, 24);
  state.maxApiReq = numOf(live.max_concurrent_api_requests, '');
  state.candleLock = numOf(live.candle_lock_timeout_seconds, 10);
  state.marketSnapshotStrategy = textVal(live.market_snapshot_ticker_strategy || 'auto');
  state.maxActiveTailGap = numOf(live.max_active_candle_tail_gap_minutes, 10);
  state.foragerHysteresis = numOf(live.forager_score_hysteresis_pct, 0.02);
  state.maxForagerStale = numOf(live.max_forager_candle_staleness_minutes, '');
  state.maxForagerRefresh = numOf(live.max_forager_candle_refresh_seconds, 45);
  state.hslAcceptIncomplete = !!live.hsl_accept_incomplete_history;
  state.forceColdStartup = !!live.force_cold_startup;
  state.feeConversionAge = numOf(live.fee_conversion_max_age_ms, 86400000);
  state.exchangeSymbolCooldown = numOf(live.exchange_symbol_unavailable_cooldown_hours, 6);
  state.feePctFallback = numOf(live.fee_pct_fallback, 0.0002);
  state.feePctSanity = numOf(live.fee_pct_sanity_abs_max, 0.001);
  state.churnActivationCount = numOf(live.order_replacement_churn_gate_activation_count, 10);
  state.churnMarketDist = numOf(live.order_replacement_churn_gate_market_dist_pct, 0.005);
  state.churnStabilityMinutes = numOf(live.order_replacement_churn_gate_stability_minutes, 2);
  state.churnWindowMinutes = numOf(live.order_replacement_churn_gate_window_minutes, 10);
  state.enableForagerWs = !!live.enable_forager_ws_candles;
  state.foragerWsAudit = numOf(live.forager_ws_candle_rest_audit_minutes, 30);
  state.customEndpointsPath = live.custom_endpoints_path != null ? textVal(live.custom_endpoints_path) : '';
  state.startupPhaseBudgets = JSON.stringify(live.startup_phase_budgets || {}, null, 2);
  state.logDir = textVal(logging.dir || 'logs');
  state.logMaxBytes = numOf(logging.max_bytes_mb, 10);
  state.logBackupCount = numOf(logging.backup_count, 5);
  state.logPersist = logging.persist_to_file !== false;
  state.logRotation = logging.rotation !== false;
  state.logDebugProfiles = JSON.stringify(logging.live_event_debug_profiles || [], null, 2);
  state.monitorEnabled = monitor.enabled !== false;
  state.monitorRootDir = textVal(monitor.root_dir || 'monitor');
  state.monitorSnapshotInterval = numOf(monitor.snapshot_interval_seconds, 1);
  state.monitorCheckpoint = numOf(monitor.checkpoint_interval_minutes, 10);
  state.monitorRotationMb = numOf(monitor.event_rotation_mb, 128);
  state.monitorRotationMinutes = numOf(monitor.event_rotation_minutes, 60);
  state.monitorMaxBytes = numOf(monitor.max_total_bytes, 1073741824);
  state.monitorPriceInterval = numOf(monitor.price_tick_min_interval_ms, 500);
  state.monitorRetainDays = numOf(monitor.retain_days, 7);
  state.monitorCompress = monitor.compress_rotated_segments !== false;
  state.monitorEmitCandles = monitor.emit_completed_candles !== false;
  state.monitorRawFills = !!monitor.include_raw_fill_payloads;
  state.monitorRetainCandles = monitor.retain_candles !== false;
  state.monitorRetainFills = monitor.retain_fills !== false;
  state.monitorRetainTicks = monitor.retain_price_ticks !== false;

  // Filters (:2443-2448)
  state.marketCap = textVal(pbgui.market_cap || 0);
  state.volMcap = numOf(pbgui.vol_mcap, 10);
  state.onlyCpt = !!pbgui.only_cpt;
  state.noticesIgnore = !!pbgui.notices_ignore;
  state.applyFilters = false;
  state.dynamicIgnore = adapter.isV8 ? false : !!pbgui.dynamic_ignore;

  // Coin multiselects (:2080-2083 equivalent — seeds from the config values)
  state.approvedLong = getCoinSelectionValue(live.approved_coins, 'long', true);
  state.approvedShort = getCoinSelectionValue(live.approved_coins, 'short', true);
  state.ignoredLong = getCoinSelectionValue(live.ignored_coins, 'long', false);
  state.ignoredShort = getCoinSelectionValue(live.ignored_coins, 'short', false);
  state.tags = Array.isArray(pbgui.tags) ? pbgui.tags.slice() : [];

  // Bot long/short (:2455-2469) — v8 extracts the active strategy block.
  let longCfg = object(bot.long);
  let shortCfg = object(bot.short);
  let paramStatus = paramStatusIn;
  let strategyCache = opts.strategyCache ?? createEmptyStrategyCache();
  let activeStrategyKind = '';
  if (adapter.isV8 && live.strategy_kind) {
    strategyCache = createEmptyStrategyCache();
    activeStrategyKind = String(live.strategy_kind);
    const longSide = selectStrategySideConfig('long', longCfg, activeStrategyKind, opts.editorMetadata, paramStatus, strategyCache);
    const shortSide = selectStrategySideConfig('short', shortCfg, activeStrategyKind, opts.editorMetadata, longSide.paramStatus, longSide.cache);
    longCfg = longSide.sideConfig;
    shortCfg = shortSide.sideConfig;
    paramStatus = shortSide.paramStatus;
    strategyCache = shortSide.cache;
  }
  state.longTwe = textVal(adapter.getBotValue(longCfg, 'total_wallet_exposure_limit', 1.7));
  state.longNpos = textVal(adapter.getBotValue(longCfg, 'n_positions', 10));
  state.shortTwe = textVal(adapter.getBotValue(shortCfg, 'total_wallet_exposure_limit', 0));
  state.shortNpos = textVal(adapter.getBotValue(shortCfg, 'n_positions', 0));
  state.longJson = JSON.stringify(longCfg, null, 2);
  state.shortJson = JSON.stringify(shortCfg, null, 2);

  // Additional Parameters: unknown live.* keys (:2480-2560)
  const liveCfg = object(cfg.live);
  const extraLive: ExtraLiveField[] = Object.keys(liveCfg)
    .filter((key) => !opts.known.has(key))
    .sort()
    .map((key) => {
      const value = liveCfg[key];
      const type = typeof value;
      // legacy: typeof null === 'object' routed null through the JSON textarea
      const kind: ExtraLiveField['kind'] =
        type === 'boolean' || type === 'number' || type === 'string' ? type : 'json';
      return {
        key,
        kind,
        text: kind === 'json' ? JSON.stringify(value ?? null, null, 2) : textVal(value ?? ''),
        checked: type === 'boolean' ? !!value : false,
      };
    });

  // Raw JSON (:2562-2570) — written from the (v8-adjusted) cfg
  const nextCfg = adapter.isV8 && live.strategy_kind
    ? { ...cfg, bot: { ...bot, long: longCfg, short: shortCfg } }
    : { ...cfg };
  const rawJson = opts.skipRawUpdate ? (opts.rawJson ?? '') : JSON.stringify(nextCfg, null, 2);

  return {
    state: { ...state, rawJson },
    extraLive,
    cfg: nextCfg,
    rawJson,
    paramStatus,
    activeStrategyKind,
  };
}
