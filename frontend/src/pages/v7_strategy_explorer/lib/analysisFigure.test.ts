import { describe, expect, it } from 'vitest';
import { analysisLayout, buildAnalysisFigure } from './analysisFigure';
import type { StrategySnapshot } from '../types';

/* Analysis figure spec — port of renderPlot (:1391-1701) as a pure builder.
   The legacy function assembled traces/shapes/annotations and handed them to
   Plotly.react; here the builder returns the same spec and the component
   renders it. */

const t = (key: string, params?: Record<string, unknown>) =>
  key === 'v7explore.analysisTime' ? 'Analysis' : key === 'v7explore.entryCloseGridsVisualization' ? `Grids ${String((params as { side?: string })?.side ?? '')}` : key;

function snapshot(): StrategySnapshot {
  return {
    market: { reference_price: 100, exchange: 'binance', coin: 'BTC', metadata: { ohlcv: { selected_start: '2024-01-01T00:00:00' } } },
    candles: [
      { timestamp: '2024-01-01T00:00:00', open: 100, high: 110, low: 95, close: 105, volume: 1 },
      { timestamp: '2024-01-01T00:01:00', open: 105, high: 112, low: 104, close: 111, volume: 2 },
    ],
    sides: {
      long: {
        active: true,
        modes: { entry: 'GridOnly', close: 'GridOnly' },
        orders: {
          entries: [{ index: 1, price: 95, qty: 1 }, { index: 2, price: 92, qty: 1 }],
          closes: [{ index: 1, price: 112, qty: -1 }, { index: 2, price: 118, qty: -1 }],
        },
        debug: { state_params: { ema_bands: { lower: 99, upper: 120 } } },
      },
      short: { active: false, debug: { state_params: { ema_bands: { lower: 99, upper: 120 } } } },
    },
  };
}

describe('buildAnalysisFigure (:1391-1701)', () => {
  it('emits the candlestick + entry/close line traces and EMA reference line', () => {
    const fig = buildAnalysisFigure('long', snapshot(), null, t);
    const names = fig.traces.map((tr) => String(tr.name));
    expect(names[0]).toBe('Price (1m)');
    expect(names).toContain('Entry Grid (Lines)');
    expect(names).toContain('Close Grid (Lines)');
    expect(names).toContain('EMA Band');
    expect(fig.plotInfo.bucketSize).toBe(1);
  });

  it('adds entry/close range bands as rect shapes with legend swatches', () => {
    const fig = buildAnalysisFigure('long', snapshot(), null, t);
    const rects = fig.shapes.filter((s) => (s as { type?: string }).type === 'rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    expect(fig.traces.some((tr) => tr.name === 'Entry Grid (Range)')).toBe(true);
    expect(fig.traces.some((tr) => tr.name === 'Close Grid (Area)')).toBe(true);
  });

  it('uses the lower EMA band for long and the upper band for short (:1432-1435)', () => {
    const long = buildAnalysisFigure('long', snapshot(), null, t);
    const short = buildAnalysisFigure('short', snapshot(), null, t);
    const longLines = long.shapes.filter((s) => (s as { type?: string }).type === 'line' && (s as { y0?: number }).y0 === 99);
    const shortLines = short.shapes.filter((s) => (s as { type?: string }).type === 'line' && (s as { y0?: number }).y0 === 120);
    expect(longLines).toHaveLength(1);
    expect(shortLines).toHaveLength(1);
  });

  it('pads the y-range by 5% of the data span (:1680-1686)', () => {
    const fig = buildAnalysisFigure('long', snapshot(), null, t);
    expect(fig.yRange).not.toBeNull();
    const [min, max] = fig.yRange!;
    expect(min).toBeLessThan(92);
    expect(max).toBeGreaterThan(115);
  });

  it('marks the analysis-time vertical line when a start exists (:1631-1635)', () => {
    const fig = buildAnalysisFigure('long', snapshot(), null, t);
    const vlines = fig.shapes.filter(
      (s) => (s as { type?: string }).type === 'line' && (s as { xref?: string }).xref === 'x' && (s as { yref?: string }).yref === 'paper'
    );
    expect(vlines).toHaveLength(1);
    expect(fig.annotations).toHaveLength(1);
  });

  it('appends buy/sell fill traces only when sim events are supplied (:1675-1679)', () => {
    const without = buildAnalysisFigure('long', snapshot(), null, t);
    const events = [
      { timestamp: '2024-01-01T00:00:30', qty: 1, price: 101, order_type: 'grid' },
      { timestamp: '2024-01-01T00:00:40', qty: -1, price: 108, order_type: 'grid' },
    ];
    const withFills = buildAnalysisFigure('long', snapshot(), events, t);
    expect(without.traces.some((tr) => tr.name === 'Buy Fills')).toBe(false);
    expect(withFills.traces.some((tr) => tr.name === 'Buy Fills')).toBe(true);
    expect(withFills.traces.some((tr) => tr.name === 'Sell Fills')).toBe(true);
  });

  it('shows trailing traces only when the entry mode is not GridOnly (:1556, :1623)', () => {
    const snap = snapshot();
    snap.sides!.long!.modes = { entry: 'TrailingFirst', close: 'GridOnly' };
    snap.sides!.long!.orders = {
      entries: [],
      closes: [],
      simulated_entry_trailing: [{ index: 1, price: 98 }],
      potential_entry_trailing_prices: [97, 96],
    };
    snap.sides!.long!.visual_params = { entry_trailing_threshold_pct: 0.02 };
    const fig = buildAnalysisFigure('long', snap, null, t);
    expect(fig.traces.some((tr) => String(tr.name).startsWith('Entry Trailing'))).toBe(true);
  });
});

describe('analysisLayout (:1690-1700)', () => {
  it('builds the dark layout with date axis and padded y-range', () => {
    const fig = buildAnalysisFigure('long', snapshot(), null, t);
    const layout = analysisLayout(fig, 'long', t) as Record<string, Record<string, unknown>>;
    expect(layout.paper_bgcolor).toBe('#1d1a23');
    expect(layout.xaxis?.type).toBe('date');
    expect(layout.yaxis?.range).toEqual(fig.yRange);
    expect((layout.legend as { orientation?: string }).orientation).toBe('h');
  });
});
