import { getHslValue, getSideValue } from './sideValues';
import type { BacktestResultItem, BacktestVersion, BeSeries, ParsedCsv, ResultsVersionFilter, SortSpec } from '../types';

/**
 * The results view's pure model — filters/sorting (:5342-5610), the BE CSV
 * normalizer (:6920-6966), the fills timestamp resolver (:7289-7335), the
 * TWE exposure pivot (:7413-7482), the equity hard-stop math (:7044-7125)
 * and the price-market cross (:6550-6570). Everything here is data-only;
 * Plotly specs live in resultCharts.ts.
 */

/** resultsForSelectedVersion (:5342-5347). */
export function resultsForVersion(items: readonly BacktestResultItem[], filter: ResultsVersionFilter): BacktestResultItem[] {
  return items.filter((result) => filter === 'both' || result.backtest_version === filter);
}

/** renderResults' filter (:5589-5595): exact config + lowercase name hay. */
export function filterResults(items: readonly BacktestResultItem[], configName: string, needle: string): BacktestResultItem[] {
  const filter = needle.trim().toLowerCase();
  return items.filter((result) => {
    if (configName && result.config_name !== configName) return false;
    if (!filter) return true;
    const hay = `${result.config_name || ''} ${result.result_name || ''}`.toLowerCase();
    return hay.includes(filter);
  });
}

/** renderResults' comparator (:5599-5610) — case-folded, undefined → ''. */
function compareResults(a: BacktestResultItem, b: BacktestResultItem, col: string, asc: boolean): number {
  let va: string | number = ((a as unknown as Record<string, unknown>)[col] ?? '') as string | number;
  let vb: string | number = ((b as unknown as Record<string, unknown>)[col] ?? '') as string | number;
  if (typeof va === 'string') va = va.toLowerCase();
  if (typeof vb === 'string') vb = vb.toLowerCase();
  if (va < vb) return asc ? -1 : 1;
  if (va > vb) return asc ? 1 : -1;
  return 0;
}

/** renderResults' sort (:5599-5610) — returns a new array. */
export function sortResults(items: readonly BacktestResultItem[], spec: SortSpec): BacktestResultItem[] {
  return items.slice().sort((a, b) => compareResults(a, b, spec.col, spec.asc));
}

/** _applyResultsData's config name list (:5362-5365). */
export function resultConfigNames(items: readonly BacktestResultItem[]): string[] {
  const names: Record<string, true> = {};
  for (const result of items) {
    if (result.config_name) names[result.config_name] = true;
  }
  return Object.keys(names).sort();
}

/** The table/chart display name (:5543, :6974). */
export function resultDisplayName(result: BacktestResultItem): string {
  return result.display_name || `${result.config_name}/${result.exchange_dir || ''}/${result.result_name || ''}`;
}

/** Keep only paths still present after a reload (selection is path-keyed). */
export function pruneSelection(selected: ReadonlySet<string>, items: readonly BacktestResultItem[]): Set<string> {
  const present = new Set(items.map((item) => item.path));
  return new Set([...selected].filter((path) => present.has(path)));
}

/** parseIsoMillis (:7596-7599). */
export function parseIsoMillis(value: string | undefined): number {
  const ts = Date.parse(value || '');
  return Number.isNaN(ts) ? Number.NaN : ts;
}

/* ── Balance & Equity normalization (:6920-6966) ────────────────────── */

/**
 * normalizeBE — mirrors the legacy load_be() timestamp handling exactly:
 * new format (datetime index + usd_ columns), old format (minute index +
 * balance/equity columns counted back from end_date) and a datetime
 * fallback that accepts either column naming.
 */
export function normalizeBe(csv: ParsedCsv, result: BacktestResultItem): BeSeries {
  const rows = csv.rows;
  const headers = csv.headers.map((header) => header.trim());
  const be: BeSeries = { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] };
  if (!rows.length) return be;

  const firstRow = rows[0]!;
  const indexKey = headers[0] ?? '';
  const hasUsd = headers.includes('usd_total_balance');
  const hasMinuteIdx = !Number.isNaN(Number.parseFloat(firstRow[indexKey] ?? ''));

  if (hasUsd) {
    for (const row of rows) {
      be.time.push(row[indexKey] ?? '');
      be.balance.push(Number.parseFloat(row.usd_total_balance ?? '') || 0);
      be.equity.push(Number.parseFloat(row.usd_total_equity ?? '') || 0);
      be.balance_btc.push(Number.parseFloat(row.btc_total_balance ?? '') || 0);
      be.equity_btc.push(Number.parseFloat(row.btc_total_equity ?? '') || 0);
    }
  } else if (hasMinuteIdx) {
    const endDate = result.end_date || '';
    const endTs = endDate ? new Date(endDate).getTime() : Date.now();
    const maxMinute = Number.parseFloat(rows[rows.length - 1]![indexKey] ?? '') || 1;
    const startTs = endTs - maxMinute * 60000;
    for (const row of rows) {
      const minute = Number.parseFloat(row[indexKey] ?? '') || 0;
      be.time.push(new Date(startTs + minute * 60000).toISOString());
      be.balance.push(Number.parseFloat(row.balance ?? '') || 0);
      be.equity.push(Number.parseFloat(row.equity ?? '') || 0);
      be.balance_btc.push(Number.parseFloat(row.balance_btc ?? '') || 0);
      be.equity_btc.push(Number.parseFloat(row.equity_btc ?? '') || 0);
    }
  } else {
    for (const row of rows) {
      be.time.push(row[indexKey] ?? '');
      be.balance.push(Number.parseFloat(row.balance ?? row.usd_total_balance ?? '') || 0);
      be.equity.push(Number.parseFloat(row.equity ?? row.usd_total_equity ?? '') || 0);
      be.balance_btc.push(Number.parseFloat(row.balance_btc ?? row.btc_total_balance ?? '') || 0);
      be.equity_btc.push(Number.parseFloat(row.equity_btc ?? row.btc_total_equity ?? '') || 0);
    }
  }
  return be;
}

/* ── Fills timestamps (:7289-7335) ──────────────────────────────────── */

/**
 * resolveFillsTimes — the historical load_fills() priority: `time`, then
 * `timestamp` (numeric ms/s or a UTC datetime string), then the legacy
 * `minute` offset from end_date, else the row index.
 */
export function resolveFillsTimes(
  rows: readonly Record<string, string>[],
  headers: readonly string[],
  result: BacktestResultItem
): (string | number)[] {
  if (headers.includes('time')) {
    return rows.map((row) => row.time ?? '');
  }

  if (headers.includes('timestamp')) {
    const firstVal = (rows[0] ?? {}).timestamp ?? '';
    const isNumeric = /^[-+]?\d+(\.\d+)?$/.test(String(firstVal).trim());
    return rows.map((row) => {
      const raw = row.timestamp ?? '';
      if (isNumeric) {
        const n = Number.parseFloat(raw) || 0;
        const ms = n > 1e11 ? n : n * 1000;
        return new Date(ms).toISOString();
      }
      // PB backtest datetime strings are UTC even without an explicit zone.
      let normalized = raw.replace(' ', 'T');
      if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) normalized += 'Z';
      return new Date(normalized).toISOString();
    });
  }

  if (headers.includes('minute')) {
    const endDate = result.end_date || '';
    const endTs = endDate ? new Date(endDate).getTime() : Date.now();
    let maxMin = 0;
    for (const row of rows) {
      const minute = Number.parseFloat(row.minute ?? '') || 0;
      if (minute > maxMin) maxMin = minute;
    }
    const startTs = endTs - maxMin * 60000;
    return rows.map((row) => {
      const minute = Number.parseFloat(row.minute ?? '') || 0;
      return new Date(startTs + minute * 60000).toISOString();
    });
  }

  return rows.map((_row, index) => index);
}

/* ── TWE exposure pivot (:7413-7482) ────────────────────────────────── */

export interface ExposureFill {
  time: string | number;
  coin: string;
  we: number;
}

export interface ExposureSeries {
  times: string[];
  twe: number[];
  coins: Record<string, number[]>;
}

/**
 * buildExposure — the historical resample(...).max().ffill().fillna(0):
 * per-coin last-WE forward-fill, TWE summed, per-resolution-bucket max,
 * then a complete bucket grid with gaps forward-filled.
 */
export function buildExposure(fills: readonly ExposureFill[], resolutionMinutes: number): ExposureSeries {
  const coinSet: Record<string, true> = {};
  for (const fill of fills) coinSet[fill.coin] = true;
  const coins = Object.keys(coinSet).sort();
  if (!coins.length) return { times: [], twe: [], coins: {} };

  const coinData: Record<string, Record<string, number>> = {};
  for (const coin of coins) coinData[coin] = {};
  for (const fill of fills) coinData[fill.coin]![String(fill.time)] = fill.we;

  const allTimesSet: Record<string, true> = {};
  for (const fill of fills) allTimesSet[String(fill.time)] = true;
  const allTimes = Object.keys(allTimesSet).sort();

  const lastWe: Record<string, number> = {};
  for (const coin of coins) lastWe[coin] = 0;
  const timeline: Array<{ time: string; coinWe: Record<string, number>; twe: number }> = [];
  for (const time of allTimes) {
    for (const coin of coins) {
      const we = coinData[coin]![time];
      if (we !== undefined) lastWe[coin] = we;
    }
    let totalWe = 0;
    const coinWe: Record<string, number> = {};
    for (const coin of coins) {
      coinWe[coin] = lastWe[coin]!;
      totalWe += lastWe[coin]!;
    }
    timeline.push({ time, coinWe, twe: totalWe });
  }

  const resMs = resolutionMinutes * 60000;
  const buckets: Record<string, { time: string; coinWe: Record<string, number>; twe: number }> = {};
  for (const entry of timeline) {
    const ts = new Date(entry.time).getTime();
    if (Number.isNaN(ts)) continue;
    const bucketKey = String(Math.floor(ts / resMs) * resMs);
    const existing = buckets[bucketKey];
    if (!existing || entry.twe > existing.twe) buckets[bucketKey] = entry;
  }

  const allTs = timeline.map((entry) => new Date(entry.time).getTime()).filter((ts) => !Number.isNaN(ts));
  if (!allTs.length) return { times: [], twe: [], coins: {} };
  const minBucket = Math.floor(Math.min(...allTs) / resMs) * resMs;
  const maxBucket = Math.floor(Math.max(...allTs) / resMs) * resMs;

  const outTimes: string[] = [];
  const outTwe: number[] = [];
  const outCoins: Record<string, number[]> = {};
  for (const coin of coins) outCoins[coin] = [];

  let lastEntry: { time: string; coinWe: Record<string, number>; twe: number } | null = null;
  for (let bucket = minBucket; bucket <= maxBucket; bucket += resMs) {
    const entry = buckets[String(bucket)];
    if (entry) lastEntry = entry;
    if (!lastEntry) continue; // fillna(0): skip the leading empties
    outTimes.push(new Date(bucket).toISOString());
    outTwe.push(lastEntry.twe);
    for (const coin of coins) outCoins[coin]!.push(lastEntry.coinWe[coin] ?? 0);
  }

  return { times: outTimes, twe: outTwe, coins: outCoins };
}

/* ── Equity hard-stop math (:7044-7125) ─────────────────────────────── */

export interface HardStopSideConfig {
  side: string;
  redThreshold: number;
  emaSpan: number;
  yellowThreshold: number;
  orangeThreshold: number;
}

/** _hardStopSideConfig (:7044-7060) — null when disabled/incomplete. */
export function hardStopSideConfig(version: BacktestVersion, config: unknown, side: string): HardStopSideConfig | null {
  const bot = (config && typeof config === 'object' ? (config as { bot?: unknown }).bot : null) as Record<string, unknown> | null;
  const sideConfig = (bot && typeof bot === 'object' ? bot[side] : null) as unknown;
  const twel = Number.parseFloat(String(getSideValue(version, sideConfig, 'total_wallet_exposure_limit', 0))) || 0;
  const nPositions = Math.round(Number.parseFloat(String(getSideValue(version, sideConfig, 'n_positions', 0))) || 0);
  const redThreshold = Number.parseFloat(String(getHslValue(version, sideConfig, 'red_threshold', 0))) || 0;
  const emaSpan = Number.parseFloat(String(getHslValue(version, sideConfig, 'ema_span_minutes', 0))) || 0;
  if (!getHslValue(version, sideConfig, 'enabled', false) || twel <= 0 || nPositions <= 0 || redThreshold <= 0 || emaSpan <= 0) {
    return null;
  }
  const ratios = (getHslValue(version, sideConfig, 'tier_ratios', {}) ?? {}) as Record<string, unknown>;
  return {
    side,
    redThreshold,
    emaSpan,
    yellowThreshold: (Number.parseFloat(String(ratios.yellow ?? 0.5)) || 0.5) * redThreshold,
    orangeThreshold: (Number.parseFloat(String(ratios.orange ?? 0.75)) || 0.75) * redThreshold,
  };
}

/** _hardStopLookbackDays (:7062-7069) — default 30, 'all' → null. */
export function hardStopLookbackDays(config: unknown): number | null {
  const live = (config && typeof config === 'object' ? (config as { live?: unknown }).live : null) as Record<string, unknown> | null;
  const raw = live?.pnls_max_lookback_days;
  if (raw === undefined || raw === null || raw === '') return 30;
  if (String(raw).trim().toLowerCase() === 'all') return null;
  const days = Number.parseFloat(String(raw));
  return Number.isFinite(days) && days > 0 ? days : 30;
}

/** _rollingDrawdown (:7071-7092) — monotonic-deque rolling peak drawdown. */
export function rollingDrawdown(timesMs: readonly number[], equity: readonly number[], lookbackDays: number | null): number[] {
  const drawdown: number[] = [];
  const deque: number[] = [];
  const lookbackMs = lookbackDays === null ? null : lookbackDays * 24 * 60 * 60 * 1000;
  for (let i = 0; i < equity.length; i++) {
    const ts = timesMs[i] ?? Number.NaN;
    const eq = equity[i] ?? Number.NaN;
    if (!Number.isFinite(ts) || !Number.isFinite(eq)) {
      drawdown.push(0);
      continue;
    }
    if (lookbackMs !== null) {
      while (deque.length > 0 && (timesMs[deque[0]!] ?? Number.NaN) < ts - lookbackMs) deque.shift();
    }
    while (deque.length > 0 && (equity[deque[deque.length - 1]!] ?? -Infinity) <= eq) deque.pop();
    deque.push(i);
    const peak = deque.length > 0 ? equity[deque[0]!]! : eq;
    const dd = peak > 0 ? 1 - eq / peak : 0;
    drawdown.push(Math.max(0, dd));
  }
  return drawdown;
}

/** _hardStopEma (:7094-7114) — time-decayed EMA of the raw drawdown. */
export function hardStopEma(timesMs: readonly number[], raw: readonly number[], emaSpanMinutes: number): number[] {
  const alpha = 2.0 / (emaSpanMinutes + 1.0);
  const ema: number[] = [];
  let prev = 0;
  let lastMinute = timesMs.length > 0 ? Math.floor((timesMs[0] ?? 0) / 60000) : 0;
  for (let i = 0; i < raw.length; i++) {
    const currentMinute = Math.floor((timesMs[i] ?? 0) / 60000);
    if (i === 0) {
      ema.push(prev);
      continue;
    }
    const elapsed = Math.max(0, currentMinute - lastMinute);
    if (elapsed > 0) {
      const decay = Math.pow(1.0 - alpha, elapsed);
      prev = (raw[i] ?? 0) + (prev - (raw[i] ?? 0)) * decay;
    }
    ema.push(Math.max(0, prev));
    lastMinute = currentMinute;
  }
  return ema;
}

/** _hardStopTriggerIndices (:7116-7125) — rising edges over the threshold. */
export function hardStopTriggerIndices(score: readonly number[], redThreshold: number): number[] {
  const indices: number[] = [];
  let wasTriggered = false;
  for (let i = 0; i < score.length; i++) {
    const triggered = Number.isFinite(score[i] ?? Number.NaN) && (score[i] ?? 0) >= redThreshold;
    if (triggered && !wasTriggered) indices.push(i);
    wasTriggered = triggered;
  }
  return indices;
}

/** The drawdown chart's normalized 1 → 0 curve (:6981-6989). */
export function drawdownSeries(equity: readonly number[]): number[] {
  const dd: number[] = [];
  let maxEq = 0;
  for (const eq of equity) {
    if (eq > maxEq) maxEq = eq;
    dd.push(maxEq > 0 ? 1 + (eq - maxEq) / maxEq : 1);
  }
  return dd;
}

/* ── Price overlay market cross (:6550-6570) ────────────────────────── */

export interface PriceMarket {
  exchange: string;
  coin: string;
}

/** resultPriceMarkets (:6550-6570) — exchange × coin for the BE overlay. */
export function resultPriceMarkets(result: BacktestResultItem): PriceMarket[] {
  let coins = Array.isArray(result.coins) ? result.coins.slice() : [];
  if (!coins.length && result.coins_text) coins = String(result.coins_text).split(',');
  coins = coins
    .map((value) => String(value ?? '').trim())
    .filter((value, index, values) => value && value.toLowerCase() !== 'all' && values.indexOf(value) === index);
  const exchangeDir = String(result.exchange_dir ?? '').trim();
  const exchangeDirLower = exchangeDir.toLowerCase();
  const exchanges =
    exchangeDir && exchangeDirLower !== 'combined' && exchangeDirLower !== 'suite_runs'
      ? [exchangeDir]
      : Array.isArray(result.exchanges)
        ? result.exchanges.slice()
        : [];
  const uniqueExchanges = exchanges
    .map((value) => String(value ?? '').trim())
    .filter((value, index, values) => value && value.toLowerCase() !== 'combined' && values.indexOf(value) === index);
  const markets: PriceMarket[] = [];
  for (const exchange of uniqueExchanges) {
    for (const coin of coins) markets.push({ exchange, coin });
  }
  return markets;
}

/** priceMarketOptionValue (:6571-6573). */
export function priceMarketOptionValue(market: PriceMarket): string {
  return `${encodeURIComponent(market.exchange)}|${encodeURIComponent(market.coin)}`;
}

/** selectedPriceMarket's decode (:6793-6801). */
export function priceMarketFromOptionValue(value: string): PriceMarket | null {
  if (!value || !value.includes('|')) return null;
  const parts = value.split('|', 2) as [string, string];
  try {
    return { exchange: decodeURIComponent(parts[0]), coin: decodeURIComponent(parts[1]) };
  } catch {
    return null;
  }
}

/** pricePayloadCoversChart (:6826-6836). */
export function pricePayloadCoversChart(payload: { available?: boolean; time?: string[]; coverage_start?: string; coverage_end?: string; coverage_complete?: boolean }, be: BeSeries): boolean {
  if (!(payload && payload.available && payload.time && payload.time.length)) return false;
  const chartStart = Date.parse(be.time[0] ?? '');
  const chartEnd = Date.parse(be.time[be.time.length - 1] ?? '');
  const coverageStart = Date.parse(payload.coverage_start ?? '');
  const coverageEnd = Date.parse(payload.coverage_end ?? '');
  return Number.isFinite(chartStart) && Number.isFinite(chartEnd) && Number.isFinite(coverageStart) && Number.isFinite(coverageEnd)
    ? coverageStart <= chartStart && coverageEnd >= chartEnd
    : Boolean(payload.coverage_complete);
}
