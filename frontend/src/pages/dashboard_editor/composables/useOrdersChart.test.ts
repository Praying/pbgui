import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrdersChart, type OrdersChartController } from './useOrdersChart';
import { positionEntryColor } from '../lib/format';
import type { Candle, OrdersData } from '../types/widgets';

/*
 * useOrdersChart — port of renderOrders (dashboard_render.js:3286-3610), the
 * Lightweight-Charts candlestick controller: setData/prependData/updateCandle/
 * updatePosition/updateOrders/_gen/destroy + lazy load-more. The old code is
 * the spec; every assertion cites it.
 *
 * The vendored /app chart library is a window global (R2) — tests install a
 * v3-API fake; a dedicated suite exercises the v4 addSeries adapter
 * (render.js:3346-3349, 3423-3425).
 */

/* ── the LightweightCharts fake (v3 API by default) ── */

interface PriceLineMock {
  applyOptions: ReturnType<typeof vi.fn>;
}

interface SeriesMock {
  setData: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
  createPriceLine: ReturnType<typeof vi.fn>;
  removePriceLine: ReturnType<typeof vi.fn>;
}

interface ChartMock {
  applyOptions: ReturnType<typeof vi.fn>;
  priceScale: ReturnType<typeof vi.fn>;
  volScaleApplyOptions: ReturnType<typeof vi.fn>;
  timeScale: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  addCandlestickSeries?: ReturnType<typeof vi.fn>;
  addHistogramSeries?: ReturnType<typeof vi.fn>;
  addSeries?: ReturnType<typeof vi.fn>;
}

interface LwcEnv {
  chart: ChartMock;
  series: SeriesMock;
  volSeries: SeriesMock;
  priceLines: PriceLineMock[];
  createChart: ReturnType<typeof vi.fn>;
  ts: {
    fitContent: ReturnType<typeof vi.fn>;
    subscribeVisibleLogicalRangeChange: ReturnType<typeof vi.fn>;
    unsubscribeVisibleLogicalRangeChange: ReturnType<typeof vi.fn>;
  };
}

const CANDLESTICK_DEF = { series: 'candlestick' };
const HISTOGRAM_DEF = { series: 'histogram' };

function installLwc(v4 = false): LwcEnv {
  const priceLines: PriceLineMock[] = [];
  const makeSeries = (): SeriesMock => ({
    setData: vi.fn(),
    update: vi.fn(),
    applyOptions: vi.fn(),
    createPriceLine: vi.fn(() => {
      const line: PriceLineMock = { applyOptions: vi.fn() };
      priceLines.push(line);
      return line;
    }),
    removePriceLine: vi.fn(),
  });
  const series = makeSeries();
  const volSeries = makeSeries();
  const volScaleApplyOptions = vi.fn();
  const ts = {
    fitContent: vi.fn(),
    subscribeVisibleLogicalRangeChange: vi.fn(),
    unsubscribeVisibleLogicalRangeChange: vi.fn(),
  };
  const chart: ChartMock = {
    applyOptions: vi.fn(),
    priceScale: vi.fn(() => ({ applyOptions: volScaleApplyOptions })),
    volScaleApplyOptions,
    timeScale: vi.fn(() => ts),
    remove: vi.fn(),
  };
  if (v4) {
    chart.addSeries = vi.fn((def: unknown) => (def === CANDLESTICK_DEF ? series : volSeries));
  } else {
    chart.addCandlestickSeries = vi.fn(() => series);
    chart.addHistogramSeries = vi.fn(() => volSeries);
  }
  const createChart = vi.fn(() => chart);
  (window as unknown as Record<string, unknown>).LightweightCharts = {
    createChart,
    CrosshairMode: { Normal: 3 },
    LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
    CandlestickSeries: CANDLESTICK_DEF,
    HistogramSeries: HISTOGRAM_DEF,
  };
  return { chart, series, volSeries, priceLines, createChart, ts };
}

beforeEach(() => {
  installLwc();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).LightweightCharts;
});

/* ── fixtures ── */

function candle(t: number, o: number, h: number, l: number, c: number, v: number): Candle {
  return { t, o, h, l, c, v };
}

/* 4h apart — intraday spacing (render.js:3594) */
const BASE_CANDLES: Candle[] = [
  candle(1720000000000, 100, 110, 90, 105, 10),
  candle(1720014400000, 105, 115, 95, 108, 20),
];

const ORDERS = [
  { price: 90, amount: 1, side: 'buy' },
  { price: 120, amount: 2, side: 'sell' },
];

function payload(overrides: Partial<OrdersData> = {}): OrdersData {
  return {
    candles: BASE_CANDLES,
    orders: ORDERS,
    position: { entry: 95, size: 2, upnl: 12.5, side: 'long' },
    user: 'alice',
    symbol: 'BTCUSDT',
    ...overrides,
  };
}

function mount(
  container: HTMLElement,
  data: OrdersData,
  opts: Record<string, unknown> = {}
): OrdersChartController | null {
  return useOrdersChart(container, data, opts);
}

const DIV = (): HTMLElement => document.createElement('div');

/* ── suites ── */

describe('useOrdersChart — chart creation (render.js:3286-3363)', () => {
  it('returns null and shows the not-loaded message without the vendor global (render.js:3294-3295)', () => {
    delete (window as unknown as Record<string, unknown>).LightweightCharts;
    const div = DIV();
    const ctrl = mount(div, payload());
    expect(ctrl).toBeNull();
    expect(div.textContent).toBe('Lightweight Charts not loaded');
  });

  it('returns null with the no-candle-data message for empty candles (render.js:3297-3301)', () => {
    const div = DIV();
    const ctrl = mount(div, payload({ candles: [] }));
    expect(ctrl).toBeNull();
    expect(div.textContent).toBe('No candle data');
  });

  it('creates the chart with the verbatim options (render.js:3310-3336)', () => {
    const env = installLwc();
    const div = DIV();
    mount(div, payload());
    expect(env.createChart).toHaveBeenCalledTimes(1);
    expect(env.createChart.mock.calls[0]![0]).toBe(div);
    expect(env.createChart.mock.calls[0]![1]).toEqual({
      autoSize: true,
      layout: { background: { type: 'solid', color: '#16141a' }, textColor: '#a59eaf', fontSize: 12 },
      grid: { vertLines: { color: '#2c2836' }, horzLines: { color: '#2c2836' } },
      crosshair: { mode: 3 },
      rightPriceScale: { borderColor: '#3a3545', scaleMargins: { top: 0.1, bottom: 0.15 } },
      timeScale: { borderColor: '#3a3545', timeVisible: true, secondsVisible: false, rightOffset: 30 },
      handleScroll: true,
      handleScale: true,
    });
  });

  it('hides clock time for daily and weekly timeframes (render.js:3308)', () => {
    const env = installLwc();
    mount(DIV(), payload(), { timeframe: '1d' });
    expect(
      (env.createChart.mock.calls[0]![1] as { timeScale: { timeVisible: boolean } }).timeScale.timeVisible
    ).toBe(false);
  });

  it('sets candle data with second timestamps and the volume histogram on the hidden vol scale (render.js:3304-3306, 3414-3432)', () => {
    const env = installLwc();
    mount(DIV(), payload());
    expect(env.series.setData).toHaveBeenCalledWith([
      { time: 1720000000, open: 100, high: 110, low: 90, close: 105 },
      { time: 1720014400, open: 105, high: 115, low: 95, close: 108 },
    ]);
    expect(env.volSeries.setData).toHaveBeenCalledWith([
      { time: 1720000000, value: 10, color: 'rgba(143,181,147,0.35)' },
      { time: 1720014400, value: 20, color: 'rgba(143,181,147,0.35)' },
    ]);
    expect(env.chart.priceScale).toHaveBeenCalledWith('vol');
    expect(env.chart.volScaleApplyOptions).toHaveBeenCalledWith({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    });
  });

  it('colors volume bars by candle direction (render.js:3419)', () => {
    const env = installLwc();
    mount(DIV(), payload({
      candles: [candle(1720000000000, 100, 110, 90, 95, 5), candle(1720014400000, 95, 115, 90, 108, 7)],
    }));
    expect(env.volSeries.setData).toHaveBeenCalledWith([
      { time: 1720000000, value: 5, color: 'rgba(197,142,138,0.35)' },
      { time: 1720014400, value: 7, color: 'rgba(143,181,147,0.35)' },
    ]);
  });

  it('applies the initial auto-precision ladder for the last close (render.js:3353-3363)', () => {
    const cases: Array<[number, number, number]> = [
      [0.00005, 8, 0.00000001],
      [0.0005, 6, 0.000001],
      [0.005, 5, 0.00001],
      [0.05, 4, 0.0001],
      [0.5, 4, 0.0001],
      [5, 3, 0.001],
      [50, 2, 0.01],
      [500, 2, 0.01],
    ];
    for (const [price, precision, minMove] of cases) {
      const env = installLwc();
      mount(DIV(), payload({ candles: [candle(1720000000000, price, price, price, price, 1)] }));
      expect(env.series.applyOptions).toHaveBeenCalledWith({
        priceFormat: { type: 'price', precision, minMove },
      });
    }
  });

  it('creates the entry, market-price and order lines with legacy styling (render.js:3365-3412)', () => {
    const env = installLwc();
    mount(DIV(), payload());
    /* entry line first, then price line, then one per order */
    expect(env.series.createPriceLine).toHaveBeenCalledTimes(4);
    const entry = env.series.createPriceLine.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry).toEqual({
      price: 95,
      color: positionEntryColor(108, 95, 'long'),
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: 'Entry',
      autoscaleInfoProvider: expect.any(Function),
    });
    expect((entry.autoscaleInfoProvider as () => unknown)()).toBeNull();
    expect(positionEntryColor(108, 95, 'long')).toBe('#8fb593');
    const priceLine = env.series.createPriceLine.mock.calls[1]![0] as Record<string, unknown>;
    expect(priceLine).toEqual({
      price: 108,
      color: '#a59eaf',
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: 'Price',
      autoscaleInfoProvider: expect.any(Function),
    });
    const buy = env.series.createPriceLine.mock.calls[2]![0] as Record<string, unknown>;
    expect(buy.price).toBe(90);
    expect(buy.color).toBe('#8fb593');
    expect(buy.lineStyle).toBe(2);
    expect(buy.title).toBe('');
    const sell = env.series.createPriceLine.mock.calls[3]![0] as Record<string, unknown>;
    expect(sell.price).toBe(120);
    expect(sell.color).toBe('#c58e8a');
  });

  it('skips the entry line without a position and the price line at close 0 (render.js:3373, 3387)', () => {
    const env = installLwc();
    mount(DIV(), payload({
      position: null,
      orders: [],
      candles: [candle(1720000000000, 0, 0, 0, 0, 1)],
    }));
    expect(env.series.createPriceLine).not.toHaveBeenCalled();
  });

  it('fits the content twice after layout settles (rAF + 200ms, render.js:3434-3441)', async () => {
    const env = installLwc();
    mount(DIV(), payload());
    await vi.waitFor(() => {
      expect(env.ts.fitContent.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('useOrdersChart — updateCandle fast path (render.js:3473-3501)', () => {
  it('updates the candle and volume series in place without a data reset', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    env.series.setData.mockClear();
    ctrl.updateCandle([1720028800000, 108, 120, 100, 115, 30]);
    expect(env.series.update).toHaveBeenCalledWith({
      time: 1720028800, open: 108, high: 120, low: 100, close: 115,
    });
    expect(env.volSeries.update).toHaveBeenCalledWith({
      time: 1720028800, value: 30, color: 'rgba(143,181,147,0.35)',
    });
    expect(env.series.setData).not.toHaveBeenCalled();
  });

  it('colors a down-tick volume bar red (render.js:3483)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    ctrl.updateCandle([1720028800000, 115, 120, 100, 105, 30]);
    expect(
      (env.volSeries.update.mock.calls[0]![0] as { color: string }).color
    ).toBe('rgba(197,142,138,0.35)');
  });

  it('moves the market-price line to the new close (render.js:3485-3487)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    ctrl.updateCandle([1720028800000, 108, 120, 100, 115, 30]);
    const priceLine = env.priceLines[1]!;
    expect(priceLine.applyOptions).toHaveBeenCalledWith({ price: 115 });
  });

  it('creates the price line lazily with the literal title when it was missing (render.js:3488-3494)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload({
      candles: [candle(1720000000000, 100, 110, 90, 0, 1)],
      position: null,
      orders: [],
    }))!;
    expect(env.series.createPriceLine).not.toHaveBeenCalled();
    ctrl.updateCandle([1720014400000, 100, 110, 90, 104, 5]);
    expect(env.series.createPriceLine).toHaveBeenCalledTimes(1);
    expect(env.series.createPriceLine.mock.calls[0]![0]).toMatchObject({
      price: 104,
      color: '#a59eaf',
      title: 'Price',
    });
  });

  it('recomputes the entry-line color from the new close (render.js:3495-3500)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    /* long at 95: close 108 = profit; a close of 90 flips the line red */
    ctrl.updateCandle([1720028800000, 108, 120, 85, 90, 30]);
    const entryLine = env.priceLines[0]!;
    expect(entryLine.applyOptions).toHaveBeenCalledWith({
      color: positionEntryColor(90, 95, 'long'),
    });
    expect(positionEntryColor(90, 95, 'long')).toBe('#c58e8a');
  });
});

describe('useOrdersChart — updatePosition (render.js:3502-3521)', () => {
  it('replaces the entry line with the new position', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    const oldLine = env.priceLines[0]!;
    ctrl.updatePosition({ entry: 80, size: 1, side: 'short' });
    expect(env.series.removePriceLine).toHaveBeenCalledWith(oldLine);
    const created = env.series.createPriceLine.mock.calls[
      env.series.createPriceLine.mock.calls.length - 1
    ]![0] as Record<string, unknown>;
    expect(created.price).toBe(80);
    expect(created.color).toBe(positionEntryColor(108, 80, 'short'));
    expect(created.title).toBe('Entry');
  });

  it('clears the entry line on null (render.js:3503-3507)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    const before = env.series.createPriceLine.mock.calls.length;
    ctrl.updatePosition(null);
    expect(env.series.removePriceLine).toHaveBeenCalledWith(env.priceLines[0]!);
    expect(env.series.createPriceLine.mock.calls.length).toBe(before);
  });

  it('does not create a line for zero entries (render.js:3508)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    ctrl.updatePosition({ entry: 0, size: 1, side: 'long' });
    expect(env.series.removePriceLine).toHaveBeenCalled();
    /* entry + price + 2 order lines were created at build — nothing more */
    expect(env.series.createPriceLine).toHaveBeenCalledTimes(4);
  });
});

describe('useOrdersChart — updateOrders (render.js:3522-3547)', () => {
  it('removes every old order line and creates the new set', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    const oldBuy = env.priceLines[2]!;
    const oldSell = env.priceLines[3]!;
    ctrl.updateOrders([{ price: 70, side: 'buy' }]);
    expect(env.series.removePriceLine).toHaveBeenCalledWith(oldBuy);
    expect(env.series.removePriceLine).toHaveBeenCalledWith(oldSell);
    const created = env.series.createPriceLine.mock.calls[
      env.series.createPriceLine.mock.calls.length - 1
    ]![0] as Record<string, unknown>;
    expect(created).toMatchObject({ price: 70, color: '#8fb593', lineStyle: 2, title: '' });
  });

  it('clears the lines for an empty list (render.js:3533)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    const before = env.series.createPriceLine.mock.calls.length;
    ctrl.updateOrders([]);
    expect(env.series.removePriceLine).toHaveBeenCalledTimes(2);
    expect(env.series.createPriceLine.mock.calls.length).toBe(before);
  });
});

describe('useOrdersChart — prependData (render.js:3548-3569)', () => {
  const OLDER: Candle[] = [
    candle(1719985600000, 90, 100, 85, 100, 8),  /* strictly older */
    candle(1720000000000, 99, 101, 89, 99, 3),   /* duplicate time → dropped */
  ];

  it('rejects a stale generation without touching the series (render.js:3548-3550)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    ctrl.prependData(OLDER, 99); /* live gen is 0 */
    expect(env.series.setData).toHaveBeenCalledTimes(1); /* only the initial set */
  });

  it('applies a prepend without a generation unconditionally (render.js:3550)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    ctrl.prependData(OLDER);
    expect(env.series.setData).toHaveBeenCalledTimes(2);
  });

  it('merges older candles deduplicated by time, sorted, without a re-fit (render.js:3351-3368)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    env.ts.fitContent.mockClear();
    ctrl.prependData(OLDER, ctrl.gen());
    expect(env.series.setData).toHaveBeenLastCalledWith([
      { time: 1719985600, open: 90, high: 100, low: 85, close: 100 },
      { time: 1720000000, open: 100, high: 110, low: 90, close: 105 },
      { time: 1720014400, open: 105, high: 115, low: 95, close: 108 },
    ]);
    expect(env.volSeries.setData).toHaveBeenLastCalledWith([
      { time: 1719985600, value: 8, color: 'rgba(143,181,147,0.35)' },
      { time: 1720000000, value: 10, color: 'rgba(143,181,147,0.35)' },
      { time: 1720014400, value: 20, color: 'rgba(143,181,147,0.35)' },
    ]);
    /* R8: the visible range must survive — no fitContent on prepend */
    expect(env.ts.fitContent).not.toHaveBeenCalled();
  });
});

describe('useOrdersChart — setData / timeframe switch (render.js:3570-3603)', () => {
  const NEW_TF: Candle[] = [
    candle(1720000000000, 50, 60, 45, 55, 100),
    candle(1720086400000, 55, 65, 50, 60, 110), /* 1d apart → time hidden */
  ];

  it('replaces the data, bumps the generation and re-fits', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    expect(ctrl.gen()).toBe(0);
    env.ts.fitContent.mockClear();
    ctrl.setData(NEW_TF);
    expect(ctrl.gen()).toBe(1);
    expect(env.series.setData).toHaveBeenLastCalledWith([
      { time: 1720000000, open: 50, high: 60, low: 45, close: 55 },
      { time: 1720086400, open: 55, high: 65, low: 50, close: 60 },
    ]);
    expect(env.ts.fitContent).toHaveBeenCalled();
  });

  it('invalidates an in-flight prepend after the generation bump (render.js:3572)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    const oldGen = ctrl.gen();
    ctrl.setData(NEW_TF);
    ctrl.prependData([candle(1719900000000, 1, 2, 0.5, 1.5, 1)], oldGen);
    expect(env.series.setData).toHaveBeenCalledTimes(2); /* initial + setData, no prepend */
  });

  it('recalibrates precision with the setData ladder (render.js:3581-3587)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    /* 0.005 → 6 on the setData ladder (the initial ladder maps it to 5) */
    ctrl.setData([candle(1720000000000, 0.005, 0.006, 0.004, 0.005, 1)]);
    expect(env.series.applyOptions).toHaveBeenLastCalledWith({
      priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
    });
  });

  it('moves the market-price line to the new close (render.js:3588-3590)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    ctrl.setData(NEW_TF);
    const priceLine = env.priceLines[1]!;
    expect(priceLine.applyOptions).toHaveBeenLastCalledWith({ price: 60 });
  });

  it('auto-detects time visibility from the candle spacing (render.js:3592-3597)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    ctrl.setData(NEW_TF); /* 1d spacing → time hidden */
    expect(env.chart.applyOptions).toHaveBeenCalledWith({
      timeScale: { timeVisible: false, secondsVisible: false },
    });
    ctrl.setData(BASE_CANDLES); /* 4h spacing → time shown */
    expect(env.chart.applyOptions).toHaveBeenLastCalledWith({
      timeScale: { timeVisible: true, secondsVisible: false },
    });
  });

  it('skips visibility detection for fewer than two candles (render.js:3593)', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    env.chart.applyOptions.mockClear();
    ctrl.setData([candle(1720000000000, 1, 2, 0.5, 1.5, 1)]);
    expect(env.chart.applyOptions).not.toHaveBeenCalled();
  });

  it('re-arms the load-more handler for the new dataset (render.js:3601-3602)', () => {
    const env = installLwc();
    const onLoadMore = vi.fn();
    const ctrl = mount(DIV(), payload(), { onLoadMore })!;
    const ts = env.ts;
    const firstHandler = ts.subscribeVisibleLogicalRangeChange.mock.calls[0]![0];
    ctrl.setData(NEW_TF);
    expect(ts.unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledWith(firstHandler);
    expect(ts.subscribeVisibleLogicalRangeChange).toHaveBeenCalledTimes(2);
  });
});

describe('useOrdersChart — lazy load-more (render.js:3443-3465)', () => {
  function fireRange(env: LwcEnv, range: { from: number; to: number } | null): void {
    const handler = env.ts.subscribeVisibleLogicalRangeChange.mock.calls[0]![0] as
      (r: { from: number; to: number } | null) => void;
    handler(range);
  }

  it('does not subscribe without onLoadMore (render.js:3448)', () => {
    const env = installLwc();
    mount(DIV(), payload());
    expect(env.ts.subscribeVisibleLogicalRangeChange).not.toHaveBeenCalled();
  });

  it('fires onLoadMore with the oldest candle time in ms when range.from < 20 (render.js:3452-3461)', () => {
    const env = installLwc();
    const onLoadMore = vi.fn();
    mount(DIV(), payload(), { onLoadMore });
    fireRange(env, { from: 5, to: 100 });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onLoadMore.mock.calls[0]![0]).toBe(1720000000000);
    expect(typeof onLoadMore.mock.calls[0]![1]).toBe('function');
  });

  it('ignores null ranges and far-from-edge ranges (render.js:3453-3455)', () => {
    const env = installLwc();
    const onLoadMore = vi.fn();
    mount(DIV(), payload(), { onLoadMore });
    fireRange(env, null);
    fireRange(env, { from: 25, to: 100 });
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('latches while a load is in flight and re-arms via done() (render.js:3454, 3457-3460)', () => {
    const env = installLwc();
    const onLoadMore = vi.fn();
    mount(DIV(), payload(), { onLoadMore });
    fireRange(env, { from: 5, to: 100 });
    fireRange(env, { from: 5, to: 100 });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    (onLoadMore.mock.calls[0]![1] as () => void)();
    fireRange(env, { from: 5, to: 100 });
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('uses the merged oldest time after a prepend (render.js:3458 reads live lwData)', () => {
    const env = installLwc();
    const onLoadMore = vi.fn();
    const ctrl = mount(DIV(), payload(), { onLoadMore })!;
    fireRange(env, { from: 5, to: 100 });
    ctrl.prependData([candle(1719985600000, 90, 100, 85, 100, 8)], ctrl.gen());
    (onLoadMore.mock.calls[0]![1] as () => void)(); /* re-arm the latch */
    fireRange(env, { from: 5, to: 100 });
    expect(onLoadMore.mock.calls[1]![0]).toBe(1719985600000);
  });
});

describe('useOrdersChart — controller surface (render.js:3470-3609)', () => {
  it('exposes chart/series/chartInstance and destroy removes the chart', () => {
    const env = installLwc();
    const ctrl = mount(DIV(), payload())!;
    expect(ctrl.chart).toBe(env.chart);
    expect(ctrl.series).toBe(env.series);
    expect(ctrl.chartInstance).toBe(env.chart);
    ctrl.destroy();
    expect(env.chart.remove).toHaveBeenCalledTimes(1);
  });

  it('uses the v4 addSeries adapter when the v3 methods are absent (render.js:3346-3349, 3423-3425)', () => {
    const env = installLwc(true);
    const ctrl = mount(DIV(), payload())!;
    expect(ctrl).not.toBeNull();
    expect(env.chart.addSeries).toHaveBeenCalledWith(
      CANDLESTICK_DEF,
      expect.objectContaining({ upColor: '#8fb593' })
    );
    expect(env.chart.addSeries).toHaveBeenCalledWith(
      HISTOGRAM_DEF,
      expect.objectContaining({ priceScaleId: 'vol' })
    );
    expect(env.chart.addCandlestickSeries).toBeUndefined();
  });
});
