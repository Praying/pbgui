import { parsePlotTime } from './format';
import type { Candle } from '../types';

/** Legacy MAX_PLOT_CANDLES (:410). */
export const MAX_PLOT_CANDLES = 900;

export interface CandlePlotInfo {
  candles: Candle[];
  bucketSize: number;
  rows: number;
}

export interface CandlePlotPayload {
  name: string;
  x: (string | number)[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
}

/**
 * Downsample candles to at most MAX_PLOT_CANDLES display buckets, optionally
 * restricted to a visible [rangeStart, rangeEnd] ms window (:611-643).
 */
export function plotCandleInfo(candles: Candle[], rangeStart = NaN, rangeEnd = NaN): CandlePlotInfo {
  let source = Array.isArray(candles) ? candles : [];
  if (isFinite(rangeStart) && isFinite(rangeEnd) && rangeEnd > rangeStart) {
    source = source.filter((c) => {
      const ms = parsePlotTime(c && c.timestamp);
      return isFinite(ms) && ms >= rangeStart && ms <= rangeEnd;
    });
  }
  const rows = source.length;
  if (rows <= MAX_PLOT_CANDLES) return { candles: source, bucketSize: 1, rows };
  const bucketSize = Math.max(1, Math.ceil(rows / MAX_PLOT_CANDLES));
  const out: Candle[] = [];
  for (let i = 0; i < rows; i += bucketSize) {
    const first = source[i]!;
    let last = first;
    let high = Number(first && first.high);
    let low = Number(first && first.low);
    let volume = 0;
    for (let j = i; j < Math.min(rows, i + bucketSize); j++) {
      const c = source[j]!;
      if (!c) continue;
      const cHigh = Number(c.high);
      const cLow = Number(c.low);
      if (isFinite(cHigh)) high = isFinite(high) ? Math.max(high, cHigh) : cHigh;
      if (isFinite(cLow)) low = isFinite(low) ? Math.min(low, cLow) : cLow;
      volume += Number(c.volume || 0) || 0;
      last = c;
    }
    if (!first || !last) continue;
    out.push({ timestamp: first.timestamp, open: first.open, high, low, close: last.close, volume });
  }
  return { candles: out, bucketSize, rows: out.length };
}

/** Plotly candlestick arrays from aggregated candles (:644-655). */
export function plotCandlePayload(info: CandlePlotInfo): CandlePlotPayload {
  const candles = (info && info.candles) || [];
  const bucketSize = (info && info.bucketSize) || 1;
  return {
    name: bucketSize > 1 ? 'Price (' + bucketSize + 'm display)' : 'Price (1m)',
    x: candles.map((c) => c.timestamp),
    open: candles.map((c) => c.open),
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    close: candles.map((c) => c.close),
  };
}
