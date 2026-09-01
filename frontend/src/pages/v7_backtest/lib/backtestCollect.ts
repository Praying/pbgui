import type { BacktestFormState } from './backtestFormModel';
import type { MarketSettingsState, ResultMetricsState } from './advancedFields';
import { collectMarketSettings, collectVisibleMetrics } from './advancedFields';
import { setSideValue } from './sideValues';
import type { BacktestVersion } from '../types';

/**
 * collectBacktestConfig — the golden-parity port of collectConfig
 * (:4662-4810). The raw JSON textarea is the base object (unknown keys at
 * every level survive), each structured field overlays it, then the suite
 * fragment, coin overrides and extra backtest params merge in.
 */

export interface BacktestSuiteFragment {
  suite_enabled: boolean;
  scenarios?: unknown[];
  aggregate?: Record<string, unknown>;
  scenario_template?: Record<string, unknown>;
}

export interface BacktestCollectContext {
  readonly isV8: boolean;
  readonly suite: BacktestSuiteFragment;
  readonly coinOverrides?: Record<string, unknown>;
  /** v8-only advanced panels; null on v7 (expanders never mount, :2308/:2428). */
  readonly marketSettings: MarketSettingsState | null;
  readonly resultMetrics: ResultMetricsState | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseJsonOr(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** getManagedBacktestBaseDir (:2174-2177). */
export function getManagedBacktestBaseDir(name: string): string {
  const safeName = String(name ?? '').trim();
  return safeName ? 'backtests/pbgui/' + safeName : 'backtests/pbgui/{config-name}';
}

export function collectBacktestConfig(state: BacktestFormState, ctx: BacktestCollectContext): Record<string, unknown> {
  const version: BacktestVersion = ctx.isV8 ? 'v8' : 'v7';
  // Base from the raw JSON textarea (:4664-4666).
  const cfg = object(state.rawJson.trim() ? parseJsonOr(state.rawJson, {}) : {});

  /* backtest (:4671-4722) */
  const bt = object(cfg.backtest);
  bt.exchanges = state.exchanges.slice();
  bt.start_date = state.startDate;
  bt.end_date = state.endDateIsNow ? 'now' : state.endDate;
  bt.starting_balance = parseFloat(state.startingBalance) || 10000;
  bt.balance_sample_divider = parseFloat(state.balanceSampleDivider) || 1;
  bt.gap_tolerance_ohlcvs_minutes = parseFloat(state.gapToleranceOhlcvsMinutes) || 5;
  bt.candle_interval_minutes = parseInt(state.candleIntervalMinutes, 10) || 1;
  bt.compress_cache = state.compressCache;
  bt.filter_by_min_effective_cost = state.filterByMinEffectiveCost;
  bt.volume_normalization = state.volumeNormalization;
  bt.btc_collateral_cap = parseFloat(state.btcCollateralCap) || 0;
  const ltvVal = parseFloat(state.btcCollateralLtvCap) || 0;
  bt.btc_collateral_ltv_cap = ltvVal === 0 ? null : ltvVal;
  bt.ohlcv_source_dir = state.ohlcvSourceDir.trim() || null;
  bt.base_dir = getManagedBacktestBaseDir(state.name);
  bt.maker_fee_override = state.makerFeeEnabled ? parseFloat(state.makerFeeVal) || 0 : null;
  bt.taker_fee_override = state.takerFeeEnabled ? parseFloat(state.takerFeeVal) || 0 : null;
  bt.liquidation_threshold = parseFloat(state.liquidationThreshold) || 0;
  bt.market_order_slippage_pct = parseFloat(state.marketOrderSlippagePct) || 0;
  bt.dynamic_wel_by_tradability = state.dynamicWelByTradability;

  if (Object.keys(state.coinSources).length > 0) bt.coin_sources = { ...state.coinSources };
  else delete bt.coin_sources;
  if (Object.keys(state.marketSettingsSources).length > 0) bt.market_settings_sources = { ...state.marketSettingsSources };
  else delete bt.market_settings_sources;
  if (ctx.isV8 && ctx.marketSettings && !ctx.marketSettings.error) bt.market_settings = collectMarketSettings(ctx.marketSettings, true);
  if (ctx.isV8 && ctx.resultMetrics && !ctx.resultMetrics.error) bt.visible_metrics = collectVisibleMetrics(ctx.resultMetrics);
  cfg.backtest = bt;

  /* logging (:4724-4725) */
  cfg.logging = { ...object(cfg.logging), level: parseInt(state.loggingLevel, 10) || 0 };

  /* live (:4727-4746) */
  const live = object(cfg.live);
  const minCoinAge = parseFloat(state.minimumCoinAgeDays);
  live.minimum_coin_age_days = Number.isFinite(minCoinAge) ? minCoinAge : 30;
  live.hsl_signal_mode = state.hslSignalMode;
  live.ignored_coins = { ...object(live.ignored_coins), long: state.ignoredLong.slice(), short: state.ignoredShort.slice() };
  const allLong = state.approvedLong.includes('all');
  const allShort = state.approvedShort.includes('all');
  live.approved_coins =
    allLong && allShort ? 'all' : { long: allLong ? 'all' : state.approvedLong.slice(), short: allShort ? 'all' : state.approvedShort.slice() };
  delete live.empty_means_all_approved;
  cfg.live = live;

  /* pbgui (:4747-4753) */
  const pbgui = object(cfg.pbgui);
  pbgui.market_cap = parseFloat(state.marketCap) || 0;
  pbgui.vol_mcap = parseFloat(state.volMcap) || 10;
  pbgui.tags = state.tags.slice();
  delete pbgui.use_pbgui_market_data;
  pbgui.only_cpt = state.onlyCpt;
  pbgui.notices_ignore = state.noticesIgnore;
  cfg.pbgui = pbgui;

  /* bot (:4756-4766) — textareas are the source of truth, TWE/npos overlay */
  const bot = object(cfg.bot);
  const longJson = object(parseJsonOr(state.botLongJson, bot.long));
  const shortJson = object(parseJsonOr(state.botShortJson, bot.short));
  setSideValue(version, longJson, 'total_wallet_exposure_limit', parseFloat(state.longTwe) || 0);
  setSideValue(version, longJson, 'n_positions', parseInt(state.longNpos, 10) || 0);
  setSideValue(version, shortJson, 'total_wallet_exposure_limit', parseFloat(state.shortTwe) || 0);
  setSideValue(version, shortJson, 'n_positions', parseInt(state.shortNpos, 10) || 0);
  bot.long = longJson;
  bot.short = shortJson;
  cfg.bot = bot;

  /* suite (:4769-4778) */
  bt.suite_enabled = ctx.suite.suite_enabled;
  if (ctx.suite.suite_enabled) {
    bt.scenarios = ctx.suite.scenarios ? JSON.parse(JSON.stringify(ctx.suite.scenarios)) : [];
    const suiteAggregate = ctx.suite.aggregate ? JSON.parse(JSON.stringify(ctx.suite.aggregate)) : { default: 'mean' };
    if (ctx.isV8) {
      bt.reducer = suiteAggregate;
      delete bt.aggregate;
    } else {
      bt.aggregate = suiteAggregate;
      delete bt.reducer;
    }
    if (ctx.suite.scenario_template) pbgui.scenario_template = JSON.parse(JSON.stringify(ctx.suite.scenario_template));
    else delete pbgui.scenario_template;
  } else {
    delete bt.scenarios;
    delete bt.aggregate;
    delete bt.reducer;
    delete bt.suite_enabled;
    delete pbgui.scenario_template;
  }

  /* coin overrides (:4780-4786) */
  if (ctx.coinOverrides) cfg.coin_overrides = ctx.coinOverrides;
  else delete cfg.coin_overrides;

  /* additional (unknown) backtest params (:4789-4807) */
  for (const field of state.extraBt) {
    if (field.key === 'suite_enabled' || field.key === 'scenarios' || field.key === 'aggregate' || field.key === 'reducer') continue;
    if (field.kind === 'boolean') bt[field.key] = field.checked;
    else if (field.kind === 'number') {
      const n = parseFloat(field.text);
      bt[field.key] = Number.isNaN(n) ? field.text : n;
    } else if (field.kind === 'json') bt[field.key] = parseJsonOr(field.text, field.text);
    else if (field.kind === 'null') {
      const raw = field.text.trim();
      if (raw === '' || raw === 'null') bt[field.key] = null;
      else bt[field.key] = parseJsonOr(raw, raw);
    } else bt[field.key] = field.text;
  }

  return cfg;
}

/** finalizeBacktestConfigForSave (:4812-4821). */
export function finalizeBacktestConfigForSave(name: string, cfg: unknown): Record<string, unknown> {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('Could not collect backtest config');
  const result = cfg as Record<string, unknown>;
  const bt = object(result.backtest);
  bt.base_dir = 'backtests/pbgui/' + name;
  result.backtest = bt;
  return result;
}

/** cfgDateValueToMs (:4358-4369) — 'now' and YYYY-MM-DD, else null. */
export function backtestDateValueToMs(value: unknown): number | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'now') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** cfgValidateDateRanges (:4409-4427). */
export function validateBacktestDateRanges(cfg: Record<string, unknown>): string {
  const bt = object(cfg.backtest);
  const startMs = backtestDateValueToMs(bt.start_date);
  const endMs = backtestDateValueToMs(bt.end_date);
  if (startMs !== null && endMs !== null && endMs < startMs) return 'Backtest end_date cannot be before start_date';
  const scenarios = Array.isArray(bt.scenarios) ? bt.scenarios : [];
  for (let i = 0; i < scenarios.length; i++) {
    const sc = object(scenarios[i]);
    const scStartMs = backtestDateValueToMs(sc.start_date);
    const scEndMs = backtestDateValueToMs(sc.end_date);
    if (scStartMs !== null && scEndMs !== null && scEndMs < scStartMs) {
      const label = String(sc.label || 'scenario_' + (i + 1));
      return `Suite scenario "${label}": end_date cannot be before start_date`;
    }
  }
  return '';
}
