/**
 * ORDERS timeframe helpers — the port of the legacy inline builder's
 * `_tfMs`/`_tfLimit` (dashboard_editor.html:2025-2034) and renderOrders'
 * TIMEFRAMES button list (dashboard_render.js:3649).
 */

/** The 11 timeframe buttons, legacy order (render.js:3649). */
export const TIMEFRAMES: readonly string[] = [
  '1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w',
];

/** Legacy default timeframe (editor:2020 `currentTimeframe = '4h'`). */
export const DEFAULT_TIMEFRAME = '4h';

const TF_MS: Record<string, number> = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '30m': 1800000,
  '1h': 3600000,
  '2h': 7200000,
  '4h': 14400000,
  '6h': 21600000,
  '12h': 43200000,
  '1d': 86400000,
  '1w': 604800000,
};

/** Legacy `_tfMs`: the timeframe span in ms, 1h for unknown values (editor:2025-2030). */
export function timeframeMs(tf: string): number {
  return TF_MS[tf] ?? 3600000;
}

/** Legacy `_tfLimit`: 1500 candles for daily/weekly bars, else 500 (editor:2032-2034). */
export function timeframeLimit(tf: string): number {
  return tf === '1w' || tf === '1d' ? 1500 : 500;
}

/** Load-more page size (editor:2111 `&limit=300`). */
export const LOAD_MORE_LIMIT = 300;

/** Load-more lookback: since = oldest − tfMs × 300 (editor:2104). */
export const LOAD_MORE_LOOKBACK = 300;

/** Edge distance in bars that triggers a load-more (render.js:3455 `range.from < 20`). */
export const LOAD_MORE_EDGE_BARS = 20;
