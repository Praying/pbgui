import { deepEnsure, deepGet } from './format';
import type { ParamFieldMeta, ParamGroup } from '../types';

/** Static field tooltips (:414-430) — English fallback for FIELD_TIP_KEYS. */
export const FIELD_TOOLTIPS: Record<string, string> = {
  ohlcv_source: 'Select which local 1m OHLCV store should be used for the chart and candle-backed state injection.',
  exchange: 'Exchange / market namespace used to load markets.json metadata and OHLCV candles.',
  coin: 'Coin symbol used for market metadata, candle loading, charts, and simulations.',
  start_date: 'Analysis start date. The chart and Rust state are initialized from the nearest candle at this date/time.',
  start_time: 'Analysis start time with minute precision.',
  reference_price: 'Fallback price used when no candles are available. Candle close price overrides this when OHLCV is loaded.',
  balance: 'Wallet balance used for state, order sizing, exposure budgets, and simulations.',
  context_days: 'Number of days shown from the selected analysis start time.',
  min_cost: 'Minimum order cost accepted by the exchange. Used by Rust order quantity adjustment and min-effective-cost checks.',
  price_step: 'Exchange price tick size. Orders are rounded to this price increment.',
  min_qty: 'Minimum order quantity accepted by the exchange.',
  qty_step: 'Exchange quantity step size. Orders are rounded to this quantity increment.',
  c_mult: 'Contract multiplier. For USDT linear perps this is usually 1.',
  state_balance: 'Current wallet balance in StateParams sent to Rust.',
  state_volatility:
    'entry_volatility_logrange_ema_1h injected from candles. Used only when volatility-weighted entry parameters are non-zero.',
};

/** Field name → i18n key for the localized tooltip (v7explore.*Tip). */
export const FIELD_TIP_KEYS: Record<string, string> = {
  ohlcv_source: 'v7explore.ohlcvSourceTip',
  exchange: 'v7explore.exchangeTip',
  coin: 'v7explore.coinTip',
  start_date: 'v7explore.startDateTip',
  start_time: 'v7explore.startTimeTip',
  reference_price: 'v7explore.referencePriceTip',
  balance: 'v7explore.balanceTip',
  context_days: 'v7explore.chartContextTip',
  min_cost: 'v7explore.minCostTip',
  price_step: 'v7explore.priceStepTip',
  min_qty: 'v7explore.minQtyTip',
  qty_step: 'v7explore.qtyStepTip',
  c_mult: 'v7explore.cMultTip',
  state_balance: 'v7explore.stateBalanceTip',
  state_volatility: 'v7explore.stateVolatilityTip',
};

/** Static segment list — the v7 default (:431-439; labels via i18n keys). */
export interface SegmentDef {
  key: string;
  labelKey: string;
  fields: string[];
}

export const DEFAULT_SEGMENTS: SegmentDef[] = [
  { key: 'entry_grid', labelKey: 'v7explore.segmentEntryGrid', fields: ['entry_initial_qty_pct', 'entry_initial_ema_dist', 'entry_grid_spacing_pct', 'entry_grid_spacing_we_weight', 'entry_grid_spacing_volatility_weight', 'entry_grid_double_down_factor', 'entry_volatility_ema_span_hours', 'ema_span_0', 'ema_span_1'] },
  { key: 'entry_trailing', labelKey: 'v7explore.segmentEntryTrailing', fields: ['entry_trailing_threshold_pct', 'entry_trailing_retracement_pct', 'entry_trailing_grid_ratio', 'entry_trailing_double_down_factor', 'entry_trailing_threshold_we_weight', 'entry_trailing_threshold_volatility_weight', 'entry_trailing_retracement_we_weight', 'entry_trailing_retracement_volatility_weight'] },
  { key: 'close_grid', labelKey: 'v7explore.segmentCloseGrid', fields: ['close_grid_markup_end', 'close_grid_markup_start', 'close_grid_qty_pct', 'close_trailing_grid_ratio'] },
  { key: 'close_trailing', labelKey: 'v7explore.segmentCloseTrailing', fields: ['close_trailing_threshold_pct', 'close_trailing_retracement_pct', 'close_trailing_qty_pct', 'close_trailing_grid_ratio'] },
  { key: 'risk_state', labelKey: 'v7explore.segmentRiskState', fields: ['total_wallet_exposure_limit', 'n_positions', 'risk_we_excess_allowance_pct', 'risk_wel_enforcer_threshold', 'risk_twel_enforcer_threshold'] },
  { key: 'forager_unstuck', labelKey: 'v7explore.segmentForagerUnstuck', fields: ['forager_volatility_ema_span', 'forager_volume_ema_span', 'forager_volume_drop_pct', 'forager_score_weights.volume', 'forager_score_weights.volatility', 'forager_score_weights.ema_readiness', 'unstuck_close_pct', 'unstuck_ema_dist', 'unstuck_loss_allowance_pct', 'unstuck_threshold'] },
  { key: 'hsl', labelKey: 'v7explore.segmentHsl', fields: ['hsl_enabled', 'hsl_red_threshold', 'hsl_ema_span_minutes', 'hsl_cooldown_minutes_after_red', 'hsl_no_restart_drawdown_threshold', 'hsl_tier_ratios.yellow', 'hsl_tier_ratios.orange', 'hsl_orange_tier_mode', 'hsl_panic_close_order_type', 'live.hsl_signal_mode'] },
];

/** Static per-field metadata — the v7 default (:441-446). */
export const DEFAULT_PARAM_FIELD_META: Record<string, ParamFieldMeta> = {
  hsl_enabled: { type: 'bool' },
  hsl_orange_tier_mode: { type: 'select', options: ['tp_only_with_active_entry_cancellation', 'graceful_stop'] },
  hsl_panic_close_order_type: { type: 'select', options: ['limit', 'market'] },
  'live.hsl_signal_mode': {
    type: 'select',
    global: true,
    options: (): string[] => ['pside', 'unified'],
    label: 'live.hsl_signal_mode (global)',
  },
};

/** Normalize server-provided param groups (:450-466). */
export function normalizeParamGroups(
  groups: Array<Partial<ParamGroup> & Record<string, unknown>> | Record<string, unknown> | null | undefined
): ParamGroup[] | null {
  if (!groups || typeof groups !== 'object') return null;
  const items: unknown[] = Array.isArray(groups)
    ? groups
    : Object.keys(groups).map((key) => {
        const item = (groups as Record<string, unknown>)[key];
        return Array.isArray(item) ? { key, label: key, fields: item } : Object.assign({ key }, item || {});
      });
  const normalized = items.map((group, idx): ParamGroup => {
    const g = (group || {}) as Partial<ParamGroup> & Record<string, unknown>;
    const fields = Array.isArray(g.fields)
      ? g.fields.filter((field) => typeof field === 'string' && field)
      : [];
    return {
      key: String(g.key || g.name || 'group_' + idx),
      label: String(g.label || g.title || g.key || g.name || 'Group ' + (idx + 1)),
      fields: fields as string[],
    };
  });
  const kept = normalized.filter((group) => group.fields.length);
  return kept.length ? kept : null;
}

/** Slider min/max/step heuristics (:548-571). */
export function paramBounds(
  name: string,
  value: number,
  meta: ParamFieldMeta = DEFAULT_PARAM_FIELD_META[name] ?? {}
): { min: number; max: number; step: number } {
  const v = Number(value || 0);
  if (meta.min !== undefined || meta.max !== undefined || meta.step !== undefined) {
    const fallback = { min: 0, max: Math.max(10, v * 2 || 10), step: 0.001 };
    return {
      min: meta.min !== undefined && isFinite(Number(meta.min)) ? Number(meta.min) : fallback.min,
      max: meta.max !== undefined && isFinite(Number(meta.max)) ? Number(meta.max) : fallback.max,
      step: meta.step !== undefined && Number(meta.step) > 0 ? Number(meta.step) : fallback.step,
    };
  }
  if (name === 'n_positions') return { min: 1, max: 50, step: 1 };
  if (name === 'total_wallet_exposure_limit') return { min: 0, max: Math.max(10, v * 2 || 10), step: 0.05 };
  if (name.indexOf('forager_score_weights.') === 0 || name.indexOf('hsl_tier_ratios.') === 0 || name === 'hsl_red_threshold' || name === 'hsl_no_restart_drawdown_threshold')
    return { min: 0, max: 1, step: 0.01 };
  if (name === 'forager_volume_ema_span' || name === 'forager_volatility_ema_span' || name === 'entry_volatility_ema_span_hours')
    return { min: 0, max: Math.max(10000, v * 2 || 10000), step: 1 };
  if (name === 'hsl_cooldown_minutes_after_red') return { min: 0, max: Math.max(10000, v * 2 || 10000), step: 1 };
  if (name.indexOf('grid_ratio') >= 0 || name.indexOf('ema_dist') >= 0) return { min: -1, max: 1, step: 0.001 };
  if (
    name.indexOf('threshold') >= 0 ||
    name.indexOf('retracement') >= 0 ||
    name.indexOf('markup') >= 0 ||
    name.indexOf('qty_pct') >= 0 ||
    name.indexOf('drop_pct') >= 0 ||
    name.indexOf('loss_allowance') >= 0 ||
    name.indexOf('close_pct') >= 0
  )
    return { min: name.indexOf('unstuck_close_pct') >= 0 || name.indexOf('unstuck_ema_dist') >= 0 ? -0.5 : 0, max: 1, step: 0.001 };
  if (name.indexOf('span') >= 0) return { min: 1, max: Math.max(10000, v * 2 || 10000), step: 1 };
  if (name.indexOf('volatility_weight') >= 0) return { min: 0, max: Math.max(400, v * 2 || 400), step: 1 };
  if (name.indexOf('we_weight') >= 0 || name.indexOf('enforcer') >= 0 || name.indexOf('double_down') >= 0)
    return { min: 0, max: Math.max(20, v * 2 || 20), step: 0.01 };
  return { min: 0, max: Math.max(10, v * 2 || 10), step: 0.001 };
}

/** Translate function shape used by tooltip resolution. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Param tooltip resolution order (:697-721). */
export function paramTooltip(
  name: string,
  strategyLabel: string,
  t: Translate,
  meta: ParamFieldMeta = DEFAULT_PARAM_FIELD_META[name] ?? {}
): string {
  const metaTip = meta.tooltip;
  if (metaTip) return String(metaTip);
  const tipKey = FIELD_TIP_KEYS[name];
  if (tipKey) {
    // Missing translation falls back to the English FIELD_TOOLTIPS entry.
    const translated = t(tipKey);
    if (translated && translated !== tipKey) return translated;
  }
  const specific = FIELD_TOOLTIPS[name];
  if (specific) return specific;
  if (name.indexOf('forager_score_weights.') === 0) return t('v7explore.tipForagerScoreWeights', { label: strategyLabel });
  if (name.indexOf('forager_') === 0) return t('v7explore.tipForager', { label: strategyLabel });
  if (name.indexOf('hsl_tier_ratios.') === 0) return t('v7explore.tipHslTierRatios', { label: strategyLabel });
  if (name.indexOf('hsl_') === 0) return t('v7explore.tipHsl', { label: strategyLabel });
  if (name === 'live.hsl_signal_mode') return t('v7explore.tipHslSignalMode');
  if (name.indexOf('ema_span') >= 0) return t('v7explore.tipEmaSpan', { label: strategyLabel });
  if (name.indexOf('volatility_weight') >= 0) return t('v7explore.tipVolatilityWeight');
  if (name.indexOf('we_weight') >= 0) return t('v7explore.tipWeWeight');
  if (name.indexOf('grid_spacing') >= 0) return t('v7explore.tipGridSpacing');
  if (name.indexOf('trailing_threshold') >= 0) return t('v7explore.tipTrailingThreshold');
  if (name.indexOf('trailing_retracement') >= 0) return t('v7explore.tipTrailingRetracement');
  if (name.indexOf('double_down') >= 0) return t('v7explore.tipDoubleDown');
  if (name.indexOf('markup') >= 0) return t('v7explore.tipMarkup');
  if (name.indexOf('qty_pct') >= 0) return t('v7explore.tipQtyPct');
  if (name.indexOf('unstuck') >= 0) return t('v7explore.tipUnstuck');
  if (name.indexOf('risk_') === 0) return t('v7explore.tipRisk', { label: strategyLabel });
  if (name === 'total_wallet_exposure_limit') return t('v7explore.tipTotalWalletExposure');
  if (name === 'n_positions') return t('v7explore.tipNPositions');
  return t('v7explore.botParameter', { label: strategyLabel, name });
}

export function paramMeta(name: string, meta?: ParamFieldMeta): ParamFieldMeta {
  return meta ?? DEFAULT_PARAM_FIELD_META[name] ?? {};
}

export function paramLabel(name: string, meta?: ParamFieldMeta): string {
  return paramMeta(name, meta).label || name;
}

export interface ParamFieldPathInfo {
  global: boolean;
  path: string[];
  side: string;
}

/** Resolve the config path of a param for one side (:1772-1779). */
export function paramFieldPath(sideKey: string, name: string, meta?: ParamFieldMeta): ParamFieldPathInfo {
  const m = paramMeta(name, meta);
  const metaPath = String(m.path || name);
  let path = metaPath.split('.').filter(Boolean);
  if (path[0] === 'bot' && (path[1] === 'long' || path[1] === 'short')) path = path.slice(2);
  const global = name.indexOf('live.') === 0 || path[0] === 'live' || m.global === true;
  if (global && path[0] !== 'live') path = name.split('.');
  return { global, path, side: sideKey };
}

/**
 * Current value of a param: global fields read the config root, side fields
 * read config.bot.<side>.* — the same path setParamValue writes — so the
 * reactive editor reflects slider/select/bool/text edits immediately instead
 * of reading the stale snapshot (:1780-1784, :1772-1779).
 */
export function paramValue(
  config: Record<string, unknown>,
  name: string,
  sideKey: string,
  meta?: ParamFieldMeta
): unknown {
  const field = paramFieldPath(sideKey, name, meta);
  if (field.global) return deepGet<unknown>(config || {}, field.path, '');
  return deepGet<unknown>(config || {}, ['bot', sideKey].concat(field.path), undefined);
}

/**
 * Write a param into the config — bot.<side>.* for side fields, the config
 * root for global ones (:1785-1792). Legacy mutated the shared state object;
 * the Vue store owns the same reactive config, so the in-place write is the
 * port (callers bump the request generations afterwards).
 */
export function setParamValue(
  config: Record<string, unknown>,
  sideKey: string,
  name: string,
  value: unknown,
  meta?: ParamFieldMeta
): void {
  const field = paramFieldPath(sideKey, name, meta);
  const path = field.path;
  const rootPath = field.global ? path.slice(0, -1) : ['bot', sideKey].concat(path.slice(0, -1));
  const target = deepEnsure(config, rootPath);
  target[path[path.length - 1]!] = value;
}

/** v8-only near-bound badge ('lower' | 'upper' | '') (:1793-1811). */
export function paramNearBound(
  flavor: 'v7' | 'v8',
  sideKey: string,
  name: string,
  value: unknown,
  config: Record<string, unknown>,
  meta?: ParamFieldMeta
): '' | 'lower' | 'upper' {
  if (flavor !== 'v8' || !isFinite(Number(value))) return '';
  const field = paramFieldPath(sideKey, name, meta);
  if (field.global) return '';
  const configured = deepGet<unknown>(config || {}, ['optimize', 'bounds', sideKey].concat(field.path), null);
  const m = paramMeta(name, meta);
  const bounds =
    Array.isArray(configured) && configured.length >= 2
      ? configured
      : m.min !== undefined && m.max !== undefined
        ? [m.min, m.max]
        : null;
  if (!bounds) return '';
  const lower = Number(bounds[0]);
  const upper = Number(bounds[1]);
  const current = Number(value);
  if (!isFinite(lower) || !isFinite(upper) || upper <= lower) return '';
  const tolerance = (upper - lower) * 0.05;
  if (current <= lower + tolerance) return 'lower';
  if (current >= upper - tolerance) return 'upper';
  return '';
}
