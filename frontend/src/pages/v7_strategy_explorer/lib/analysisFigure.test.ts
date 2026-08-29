import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analysisLayout, buildAnalysisFigure } from './analysisFigure';
import { PRECISION_PALETTE } from '@/shared/lib/precisionPalette';
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
    expect((rects[0] as { fillcolor?: string }).fillcolor).toBe('rgb(217 128 128 / 0.16)');
    expect((rects[1] as { fillcolor?: string }).fillcolor).toBe('rgb(123 200 165 / 0.14)');
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

  it('uses palette-backed warning and accent trailing zones without changing thresholds', () => {
    const snap = snapshot();
    snap.sides!.long!.modes = { entry: 'TrailingFirst', close: 'TrailingFirst' };
    snap.sides!.long!.orders!.gridonly_closes = [
      { index: 1, price: 114, qty: -1 },
      { index: 2, price: 120, qty: -1 },
    ];
    snap.sides!.long!.visual_params = {
      entry_trailing_threshold_pct: 0.02,
      entry_trailing_retracement_pct: 0.01,
      close_trailing_threshold_pct: 0.02,
      close_trailing_retracement_pct: 0.01,
    };
    snap.sides!.long!.debug = {
      state_params: { ema_bands: { lower: 99, upper: 120 } },
      entry_input: { tb: { min_since_open: 90, max_since_open: 125 } },
      position_close: { price: 110 },
    };
    snap.sides!.long!.orders = {
      entries: [{ index: 1, price: 95 }],
      closes: [{ index: 1, price: 112 }],
      gridonly_entries: [{ index: 1, price: 95 }],
      gridonly_closes: [{ index: 1, price: 116 }],
    };

    const fig = buildAnalysisFigure('long', snap, null, t);
    const lineColors = fig.shapes
      .filter((shape) => (shape as { type?: string }).type === 'line')
      .map((shape) => (shape as { line?: { color?: string } }).line?.color);
    const bandColors = fig.shapes
      .filter((shape) => (shape as { type?: string }).type === 'rect')
      .map((shape) => (shape as { fillcolor?: string }).fillcolor);

    expect(lineColors).toContain('rgb(216 174 111 / 0.6)');
    expect(lineColors).toContain('rgb(216 174 111 / 0.35)');
    expect(lineColors).toContain('rgb(143 207 242 / 0.6)');
    expect(lineColors).toContain('rgb(143 207 242 / 0.35)');
    expect(bandColors).toContain('rgb(216 174 111 / 0.22)');
    expect(bandColors).toContain('rgb(143 207 242 / 0.18)');
  });
});

describe('analysisLayout (:1690-1700)', () => {
  it('builds the dark layout with date axis and padded y-range', () => {
    const fig = buildAnalysisFigure('long', snapshot(), null, t);
    const layout = analysisLayout(fig, 'long', t) as Record<string, Record<string, unknown>>;
    expect(layout.paper_bgcolor).toBe(PRECISION_PALETTE.surface.deep);
    expect(layout.xaxis?.type).toBe('date');
    expect(layout.yaxis?.range).toEqual(fig.yRange);
    expect((layout.legend as { orientation?: string }).orientation).toBe('h');
  });

  it('uses approved palette values for chart surfaces and overlays', () => {
    const figure = buildAnalysisFigure('long', snapshot(), [{ timestamp: '2024-01-01T00:00:30', qty: 1, price: 101 }], t);
    const layout = analysisLayout(figure, 'long', t) as Record<string, any>;
    expect(layout.plot_bgcolor).toBe(PRECISION_PALETTE.surface.deep);
    expect(layout.xaxis.gridcolor).toBe(PRECISION_PALETTE.border.default);
    expect(layout.yaxis.gridcolor).toBe(PRECISION_PALETTE.border.default);
    expect(layout.font.color).toBe(PRECISION_PALETTE.text.primary);
    expect(figure.traces.find((trace) => trace.name === 'Buy Fills')?.marker).toMatchObject({ color: PRECISION_PALETTE.success.base });
    expect(figure.traces.find((trace) => trace.name === 'Entry Grid (Lines)')?.line).toMatchObject({ color: PRECISION_PALETTE.danger.base });
  });

  it('contains no reviewed legacy chart literals', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'analysisFigure.ts'), 'utf8');
    for (const literal of [
      '#171c29', '#333f5c', '#10141d', '#f2f5fb', 'cyan', 'magenta', 'rgba(5, 8, 14',
    ]) {
      expect(source).not.toContain(literal);
    }
    expect(source.match(/rgba\(0, 0, 0, 0\)/g)).toHaveLength(1);
  });
});
