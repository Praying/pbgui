import { describe, expect, it } from 'vitest';
import { MAX_PLOT_CANDLES, plotCandleInfo, plotCandlePayload } from './candles';
import type { Candle } from '../types';

/* Candle aggregation for plot display — port of :611-655. */

function candle(ts: string, o: number, h: number, l: number, c: number, v = 1): Candle {
  return { timestamp: ts, open: o, high: h, low: l, close: c, volume: v };
}

describe('plotCandleInfo (:611-643)', () => {
  it('passes small arrays through unchanged with bucketSize 1', () => {
    const candles = [candle('2024-01-01T00:00:00Z', 1, 2, 0.5, 1.5), candle('2024-01-01T00:01:00Z', 1.5, 3, 1, 2)];
    const info = plotCandleInfo(candles);
    expect(info.bucketSize).toBe(1);
    expect(info.rows).toBe(2);
    expect(info.candles).toEqual(candles);
  });

  it('returns the source untouched when a range covers everything', () => {
    const candles = [candle('2024-01-01T00:00:00Z', 1, 2, 0.5, 1.5)];
    const info = plotCandleInfo(candles, Date.parse('2024-01-01T00:00:00Z'), Date.parse('2024-01-02T00:00:00Z'));
    expect(info.candles).toHaveLength(1);
  });

  it('filters candles to the requested time range', () => {
    const candles = [
      candle('2024-01-01T00:00:00Z', 1, 2, 0.5, 1.5),
      candle('2024-01-05T00:00:00Z', 5, 6, 4.5, 5.5),
    ];
    const info = plotCandleInfo(candles, Date.parse('2024-01-04T00:00:00Z'), Date.parse('2024-01-06T00:00:00Z'));
    expect(info.candles.map((c) => c.open)).toEqual([5]);
  });

  it('aggregates to at most MAX_PLOT_CANDLES buckets', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 1800; i++) {
      candles.push(candle(new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(), i, i + 1, i - 1, i + 0.5));
    }
    const info = plotCandleInfo(candles);
    expect(info.rows).toBeLessThanOrEqual(MAX_PLOT_CANDLES);
    expect(info.bucketSize).toBe(2);
    const first = info.candles[0]!;
    expect(first.open).toBe(0);
    expect(first.close).toBe(1.5); // close of the LAST candle in the bucket
    expect(first.high).toBe(2);
    expect(first.low).toBe(-1);
    expect(first.volume).toBe(2);
    expect(info.candles[0]!.timestamp).toBe(candles[0]!.timestamp);
  });
});

describe('plotCandlePayload (:644-655)', () => {
  it('names the trace by bucket size', () => {
    const one = plotCandlePayload({ candles: [candle('2024-01-01T00:00:00Z', 1, 2, 0.5, 1.5)], bucketSize: 1, rows: 1 });
    expect(one.name).toBe('Price (1m)');
    const agg = plotCandlePayload({ candles: [], bucketSize: 5, rows: 0 });
    expect(agg.name).toBe('Price (5m display)');
  });

  it('maps candles to plotly arrays', () => {
    const candles = [candle('2024-01-01T00:00:00Z', 1, 2, 0.5, 1.5), candle('2024-01-01T00:01:00Z', 1.5, 3, 1, 2)];
    const payload = plotCandlePayload({ candles, bucketSize: 1, rows: 2 });
    expect(payload.x).toEqual(['2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z']);
    expect(payload.open).toEqual([1, 1.5]);
    expect(payload.high).toEqual([2, 3]);
    expect(payload.low).toEqual([0.5, 1]);
    expect(payload.close).toEqual([1.5, 2]);
  });
});
