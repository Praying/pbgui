import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMovieFigureSpec } from './movieFigure';
import { PRECISION_PALETTE } from '@/shared/lib/precisionPalette';
import type { MovieData } from '../types';

/* Movie figure spec — port of buildMovieFigureSpec (:2562-2813). */

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

function movieData(): MovieData {
  const mk = (i: number) => ({
    index: i,
    timestamp: new Date(Date.UTC(2024, 0, 1, 0, i * 240)).toISOString(),
    candle: { open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i },
    long: {
      summary: { entry_orders: 2 + i, close_orders: 1 },
      orders: { entries: [{ price: 100 + i }], closes: [{ price: 115 + i }] },
      debug: { state_params: { ema_bands: { upper: 120, lower: 95 }, balance: 1000 } },
    },
  });
  return {
    ok: true,
    engine: 'pb8_engine',
    message: 'done',
    metadata: { exchange: 'binance', coin: 'BTC', start_time: '2024-01-01', step_mins: 240 },
    events: {
      long: [
        { timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0)).toISOString(), qty: 1, price: 101, event: 'entry_grid', pos_size: 1, wallet_balance: 990 },
        { timestamp: new Date(Date.UTC(2024, 0, 1, 8, 0)).toISOString(), qty: -1, price: 113, event: 'close_grid', pos_size: 0, wallet_balance: 1005 },
      ],
      short: [],
    },
    frames: [mk(0), mk(1), mk(2)],
  };
}

const INPUT = { visible: 2, stepMins: 240, balanceFallback: 1000, t };

describe('buildMovieFigureSpec (:2562-2813)', () => {
  it('builds one animation frame per data frame with stable names', () => {
    const spec = buildMovieFigureSpec(movieData(), 'long', INPUT)!;
    expect(spec.frames.map((f) => f.name)).toEqual(['0', '1', '2']);
    expect(spec.activeFrame).toBe(0);
  });

  it('initial data carries candle + EMA traces plus the active frame traces', () => {
    const spec = buildMovieFigureSpec(movieData(), 'long', INPUT)!;
    const names = spec.data.map((tr) => String(tr.name));
    expect(names).toContain('Price');
    expect(names).toContain('EMA High');
    expect(names).toContain('EMA Low');
    // dynamicFrame traces: entries, closes, current price, trailing, fills
    expect(names.filter((n) => n === 'Fills (B/S)')).toHaveLength(1);
    expect(names).toContain('Current Price');
  });

  it('uses approved palette values for movie traces and layout', () => {
    const spec = buildMovieFigureSpec(movieData(), 'long', INPUT)!;
    const findTrace = (traces: Record<string, unknown>[], name: string) => traces.find((trace) => trace.name === name)!;
    const emaHigh = findTrace(spec.data, 'EMA High');
    const emaLow = findTrace(spec.data, 'EMA Low');
    const currentPrice = findTrace(spec.frames[2]!.data, 'Current Price');
    const upcomingEntries = findTrace(spec.frames[2]!.data, 'Upcoming Entries');
    const upcomingCloses = findTrace(spec.frames[2]!.data, 'Upcoming Closes');
    const fills = findTrace(spec.frames[2]!.data, 'Fills (B/S)');

    expect((emaHigh.line as Record<string, unknown>).color).toBe(PRECISION_PALETTE.accent.soft);
    expect((emaLow.line as Record<string, unknown>).color).toBe(PRECISION_PALETTE.accent.base);
    expect((currentPrice.line as Record<string, unknown>).color).toBe(PRECISION_PALETTE.warning.base);
    expect((upcomingEntries.line as Record<string, unknown>).color).toBe(PRECISION_PALETTE.danger.base);
    expect((upcomingCloses.line as Record<string, unknown>).color).toBe(PRECISION_PALETTE.success.base);
    expect((fills.marker as Record<string, unknown>).color).toEqual([PRECISION_PALETTE.success.base, PRECISION_PALETTE.danger.base]);
    expect(fills.marker).toMatchObject({ line: { color: PRECISION_PALETTE.surface.deep } });
    expect((fills.textfont as Record<string, unknown>).color).toBe(PRECISION_PALETTE.text.primary);
    expect(spec.layout.paper_bgcolor).toBe(PRECISION_PALETTE.surface.deep);
    expect(spec.layout.plot_bgcolor).toBe(PRECISION_PALETTE.surface.deep);
    expect((spec.layout.font as Record<string, unknown>).color).toBe(PRECISION_PALETTE.text.primary);
    expect((spec.layout.xaxis as Record<string, unknown>).gridcolor).toBe(PRECISION_PALETTE.border.default);
    expect((spec.layout.yaxis as Record<string, unknown>).gridcolor).toBe(PRECISION_PALETTE.border.default);
    expect((spec.layout.legend as Record<string, unknown>).bgcolor).toBe(PRECISION_PALETTE.surface.deep);
    expect(((spec.layout.legend as Record<string, unknown>).font as Record<string, unknown>).color).toBe(PRECISION_PALETTE.text.primary);
  });

  it('adds play/slow/very-slow/pause buttons and one slider step per frame (:2810)', () => {
    const spec = buildMovieFigureSpec(movieData(), 'long', INPUT)!;
    const buttons = ((spec.layout.updatemenus as unknown[])[0] as { buttons: { label: string }[] }).buttons;
    expect(buttons.map((b) => b.label)).toEqual(['Play', 'Slow', 'Very Slow', 'Pause']);
    const slider = (spec.layout.sliders as unknown[])[0] as { steps: unknown[]; active: number };
    expect(slider.steps).toHaveLength(3);
    expect(slider.active).toBe(0);
  });

  it('annotates wallet state from the last fill at or before the frame (:2794-2799)', () => {
    const spec = buildMovieFigureSpec(movieData(), 'long', INPUT)!;
    const frame = spec.frames[1]!;
    const annotation = ((frame.layout as { annotations: [{ text: string }] }).annotations)[0];
    expect(annotation.text).toContain('Wallet Balance');
  });

  it('returns null when the movie has no frames (:2571)', () => {
    const data = movieData();
    data.frames = [];
    expect(buildMovieFigureSpec(data, 'long', INPUT)).toBeNull();
  });

  it('fixes the x/y range from the initial frame (no autorange) (:2810-2811)', () => {
    const spec = buildMovieFigureSpec(movieData(), 'long', INPUT)!;
    const xaxis = spec.layout.xaxis as { autorange?: boolean; range?: [string, string] };
    expect(xaxis.autorange).toBeUndefined();
    expect(xaxis.range).toHaveLength(2);
    expect(spec.layout.yaxis).toMatchObject({ autorange: false });
  });

  it('uses approved palette values for animation surfaces and overlays', () => {
    const spec = buildMovieFigureSpec(movieData(), 'long', INPUT)!;
    expect(spec.layout.paper_bgcolor).toBe(PRECISION_PALETTE.surface.deep);
    expect(spec.layout.plot_bgcolor).toBe(PRECISION_PALETTE.surface.deep);
    expect((spec.layout.font as { color: string }).color).toBe(PRECISION_PALETTE.text.primary);
    expect((spec.layout.xaxis as { gridcolor: string }).gridcolor).toBe(PRECISION_PALETTE.border.default);
    expect((spec.data.find((trace) => trace.name === 'Current Price')?.line as { color: string }).color).toBe(PRECISION_PALETTE.warning.base);
  });

  it('contains no reviewed legacy chart literals', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'movieFigure.ts'), 'utf8');
    for (const literal of ['#171c29', '#333f5c', '#10141d', '#f2f5fb', 'cyan', 'magenta', 'rgba(5, 8, 14']) {
      expect(source).not.toContain(literal);
    }
  });
});
