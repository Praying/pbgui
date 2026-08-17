/**
 * Advanced fields — the port of js/backtest_advanced_fields.js (135 L)
 * plus the page-side collectors/validators of v7_backtest.html
 * (:2372-2411, :2538-2561). v8-only editor surface (market settings +
 * result metrics); the v7 flavor never mounts it (:2308, :2428).
 */

export const MARKET_FIELDS: readonly string[] = ['qty_step', 'price_step', 'min_qty', 'min_cost', 'c_mult'];

export interface MarketSettingsRow {
  scope: 'global' | 'exchange';
  exchange: string;
  coin: string;
  values: Record<string, unknown>;
}

export interface MarketSettingsState {
  rows: MarketSettingsRow[];
  extras: Record<string, unknown>;
  /** Load error — blocks collection and fails the save gate. */
  error: string;
}

export interface ResultMetricsState {
  mode: 'default' | 'all' | 'custom';
  selected: string[];
  available: string[];
  error: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneObject(value: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(isPlainObject(value) ? value : {})) result[key] = entry;
  return result;
}

/** flattenMarketSettings (:37-70) — throws TypeError on shape violations. */
export function flattenMarketSettings(value: unknown): MarketSettingsRow[] {
  if (value !== null && value !== undefined && !isPlainObject(value)) throw new TypeError('market_settings must be an object');
  const source = (value ?? {}) as Record<string, unknown>;
  const rows: MarketSettingsRow[] = [];
  if (source.overrides !== null && source.overrides !== undefined && !isPlainObject(source.overrides)) {
    throw new TypeError('market_settings.overrides must be an object');
  }
  const globalOverrides = (source.overrides ?? {}) as Record<string, unknown>;
  for (const coin of Object.keys(globalOverrides).sort()) {
    const values = globalOverrides[coin];
    if (!isPlainObject(values)) throw new TypeError(`market_settings.overrides.${coin} must be an object`);
    rows.push({ scope: 'global', exchange: '', coin, values: cloneObject(values) });
  }
  if (source.overrides_by_exchange !== null && source.overrides_by_exchange !== undefined && !isPlainObject(source.overrides_by_exchange)) {
    throw new TypeError('market_settings.overrides_by_exchange must be an object');
  }
  const byExchange = (source.overrides_by_exchange ?? {}) as Record<string, unknown>;
  for (const exchange of Object.keys(byExchange).sort()) {
    const coinOverrides = byExchange[exchange];
    if (!isPlainObject(coinOverrides)) throw new TypeError(`market_settings.overrides_by_exchange.${exchange} must be an object`);
    for (const coin of Object.keys(coinOverrides).sort()) {
      const values = coinOverrides[coin];
      if (!isPlainObject(values)) throw new TypeError(`market_settings override ${exchange}.${coin} must be an object`);
      rows.push({ scope: 'exchange', exchange, coin, values: cloneObject(values) });
    }
  }
  return rows;
}

/** marketSettingsExtras (:72-80). */
export function marketSettingsExtras(value: unknown): Record<string, unknown> {
  const source = cloneObject(value);
  delete source.overrides;
  delete source.overrides_by_exchange;
  return source;
}

/** serializeMarketSettings (:82-103). */
export function serializeMarketSettings(
  rows: readonly MarketSettingsRow[],
  extras: Record<string, unknown>,
  preserveMarketIdentifiers: boolean
): Record<string, unknown> {
  const result = cloneObject(extras);
  const overrides: Record<string, unknown> = {};
  const overridesByExchange: Record<string, unknown> = {};
  for (const row of rows) {
    let coin = String(row.coin ?? '').trim();
    if (!preserveMarketIdentifiers) coin = coin.toUpperCase();
    if (!coin) continue;
    const values = cloneObject(row.values);
    const exchange = String(row.exchange ?? '').trim().toLowerCase();
    if (row.scope === 'exchange') {
      if (!exchange) continue;
      const bucket = (overridesByExchange[exchange] ?? {}) as Record<string, unknown>;
      bucket[coin] = values;
      overridesByExchange[exchange] = bucket;
    } else {
      overrides[coin] = values;
    }
  }
  result.overrides = overrides;
  result.overrides_by_exchange = overridesByExchange;
  return result;
}

/** visibleMetricsState (:105-116). */
export function visibleMetricsState(value: unknown): { mode: 'default' | 'all' | 'custom'; selected: string[] } {
  if (value === null || value === undefined) return { mode: 'default', selected: [] };
  if (!Array.isArray(value)) throw new TypeError('visible_metrics must be null or a list');
  if (value.length === 0) return { mode: 'all', selected: [] };
  if (value.some((item) => typeof item !== 'string' || !item.trim())) throw new TypeError('visible_metrics entries must be non-empty strings');
  return { mode: 'custom', selected: value.slice() };
}

/** metricCategory (:118-125) — t defaults to the legacy English fallbacks. */
export function metricCategory(
  metric: string,
  t: (key: string, fallback: string) => string = (_key, fallback) => fallback
): string {
  const name = String(metric ?? '').toLowerCase();
  if (name.startsWith('hard_stop_')) return t('editor.backtest.metricHardStop', 'Hard Stop');
  if (/fills|position_|positions_|trade_|win_rate|volume_|entry_interval/.test(name)) return t('editor.backtest.metricTradingActivity', 'Trading Activity');
  if (/drawdown|recovery|underwater|shortfall|paper_loss|exposure|equity_balance/.test(name)) return t('editor.backtest.metricRiskRecovery', 'Risk & Recovery');
  if (/ratio|sharpe|sortino|calmar|sterling|omega/.test(name)) return t('editor.backtest.metricPerformanceRatios', 'Performance Ratios');
  return t('editor.backtest.metricReturnsGrowth', 'Returns & Growth');
}

/** metricCategory display order (resultMetricsRender :2502). */
export const METRIC_CATEGORY_ORDER: readonly string[] = [
  'Returns & Growth',
  'Performance Ratios',
  'Risk & Recovery',
  'Trading Activity',
  'Hard Stop',
];

/** marketSettingsCollect (:2372-2383) — numeric coercion then serialize. */
export function collectMarketSettings(state: MarketSettingsState, preserveMarketIdentifiers: boolean): Record<string, unknown> {
  const rows = state.rows.map((row) => {
    const values = { ...row.values };
    for (const field of MARKET_FIELDS) {
      const raw = values[field];
      if (raw === undefined || raw === '') continue;
      const number = Number(raw);
      values[field] = Number.isFinite(number) ? number : raw;
    }
    return { ...row, values };
  });
  return serializeMarketSettings(rows, state.extras, preserveMarketIdentifiers);
}

/** resultMetricsCollect (:2538-2542). */
export function collectVisibleMetrics(state: ResultMetricsState): string[] | null {
  if (state.mode === 'default') return null;
  if (state.mode === 'all') return [];
  return state.selected.slice();
}

/** marketSettingsValidate (:2385-2411). */
export function validateMarketSettings(state: MarketSettingsState): string {
  if (state.error) return 'Market Settings is invalid: ' + state.error + '.';
  const seen = new Set<string>();
  const positiveFields = new Set(['qty_step', 'price_step', 'min_qty', 'c_mult']);
  for (let i = 0; i < state.rows.length; i++) {
    const row = state.rows[i]!;
    const coin = String(row.coin ?? '').trim();
    const exchange = row.scope === 'exchange' ? String(row.exchange ?? '').trim().toLowerCase() : '*';
    if (!coin) return `Market Settings row ${i + 1} requires a coin.`;
    if (row.scope === 'exchange' && !exchange) return `Market Settings row ${i + 1} requires an exchange.`;
    const key = exchange + ':' + coin;
    if (seen.has(key)) return `Market Settings contains a duplicate override for ${key}.`;
    seen.add(key);
    for (const field of MARKET_FIELDS) {
      const raw = row.values[field];
      if (raw === undefined || raw === '') continue;
      const number = Number(raw);
      if (!Number.isFinite(number)) return `Market Settings ${coin} ${field} must be numeric.`;
      if (positiveFields.has(field) && number <= 0) return `Market Settings ${coin} ${field} must be greater than zero.`;
      if (field === 'min_cost' && number < 0) return `Market Settings ${coin} min_cost cannot be negative.`;
    }
  }
  return '';
}

/** pb8AdvancedFieldsValidate (:2544-2561) — the v8 save gate. */
export function validatePb8AdvancedFields(isV8: boolean, marketSettings: MarketSettingsState, resultMetrics: ResultMetricsState): string {
  if (!isV8) return '';
  let error = validateMarketSettings(marketSettings);
  if (!error && resultMetrics.error) error = 'Result Metrics is invalid: ' + resultMetrics.error + '.';
  if (!error && resultMetrics.mode === 'custom' && resultMetrics.selected.length === 0) {
    error = 'Select at least one custom result metric, or choose Default or All.';
  }
  return error;
}
