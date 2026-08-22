/**
 * useOrdersChart — the port of DashRender.renderOrders
 * (dashboard_render.js:3286-3610): the Lightweight-Charts candlestick chart
 * with entry/price/order price lines, a volume histogram, two-phase
 * fit-content, and the live-update controller:
 *
 *   updateCandle / updatePosition / updateOrders   fast-path line+bar updates
 *   prependData                                    older history, view kept (R8)
 *   setData                                        timeframe switch, gen bump
 *   gen()/_gen                                     generation counter
 *   destroy                                        chart teardown
 *
 * Fast-path semantics preserved (the recon's R8 risk item): prependData merges
 * by time and calls setData WITHOUT fitContent, so the user's zoom/scroll
 * survives; only setData (a deliberate timeframe switch) re-fits.
 *
 * The v3/v4 API duality of the vendored global is preserved exactly
 * (render.js:3346-3349, 3423-3425). This is a factory, not a reactive
 * composable: the caller (WidgetOrders) owns the Vue lifecycle and calls
 * destroy() on unmount — the R4 leak fix the legacy destroy patch attempted.
 */
import { getLightweightCharts, type LwCandle, type LwChart, type LwPriceLine, type LwSeries, type LwVolume } from '../lib/lwcVendor';
import { dashT } from '../lib/i18n';
import { positionEntryColor } from '../lib/format';
import { LOAD_MORE_EDGE_BARS } from '../lib/timeframes';
import type { Candle, OrdersData } from '../types/widgets';

const UP_COLOR = '#46c88f';
const DOWN_COLOR = '#e5615c';
const VOL_UP = 'rgba(70, 200, 143,0.35)';
const VOL_DOWN = 'rgba(229, 97, 92,0.35)';
const PRICE_COLOR = '#a3adc2';
const FIT_SETTLE_MS = 200;

/** Raw exchange candle: [t, o, h, l, c, v] (render.js:3473-3474). */
export type RawCandle = [number, number, number, number, number, number];

export interface OrdersPosition {
  entry?: number;
  size?: number;
  upnl?: number;
  side?: string;
}

export interface OrdersChartOptions {
  /** Legacy opts.timeframe — hides clock time for 1d/1w (render.js:3308). */
  timeframe?: string;
  /** Lazy history loading (render.js:3447-3465, editor:2101-2123). */
  onLoadMore?: (oldestTsMs: number, done: () => void) => void;
}

export interface OrdersChartController {
  readonly chart: LwChart;
  readonly series: LwSeries;
  updateCandle(candle: RawCandle): void;
  updatePosition(posData: OrdersPosition | null): void;
  updateOrders(ordersList: Array<{ price: number; side?: string }>, ordersUnknown?: boolean): void;
  prependData(olderCandles: Candle[], gen?: number): void;
  setData(newCandles: Candle[]): void;
  /** Legacy `_gen()` — the generation counter (render.js:3604). */
  gen(): number;
  destroy(): void;
  readonly chartInstance: LwChart;
}

const toLwCandle = (c: Candle): LwCandle => ({
  time: Math.floor(c.t / 1000),
  open: c.o,
  high: c.h,
  low: c.l,
  close: c.c,
});

const toLwVolume = (c: Candle): LwVolume => ({
  time: Math.floor(c.t / 1000),
  value: c.v,
  color: c.c >= c.o ? VOL_UP : VOL_DOWN,
});

/** Initial precision ladder (render.js:3355-3361) — kept verbatim. */
export function initialPrecision(lastPrice: number): number {
  return lastPrice < 0.0001 ? 8
    : lastPrice < 0.001 ? 6
    : lastPrice < 0.01 ? 5
    : lastPrice < 0.1 ? 4
    : lastPrice < 1 ? 4
    : lastPrice < 10 ? 3
    : lastPrice < 100 ? 2
    : 2;
}

/** setData precision ladder (render.js:3584-3585) — a DIFFERENT ladder, verbatim. */
export function setDataPrecision(lastPrice: number): number {
  return lastPrice < 0.0001 ? 8
    : lastPrice < 0.001 ? 7
    : lastPrice < 0.01 ? 6
    : lastPrice < 0.1 ? 5
    : lastPrice < 1 ? 4
    : lastPrice < 10 ? 3
    : 2;
}

/** Legacy minMove: parseFloat((10^-prec).toFixed(prec)) (render.js:3362). */
export function minMoveFor(precision: number): number {
  return parseFloat(Math.pow(10, -precision).toFixed(precision));
}

/** Merge `older` in front of `existing`, deduplicated by time and sorted (render.js:3359-3362). */
export function mergeByTime<T extends { time: number }>(existing: T[], older: T[]): T[] {
  const byTime = new Map<number, T>();
  for (const c of existing) byTime.set(c.time, c);
  for (const c of older) if (!byTime.has(c.time)) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function useOrdersChart(
  container: HTMLElement,
  data: OrdersData,
  opts: OrdersChartOptions = {}
): OrdersChartController | null {
  const LWC = getLightweightCharts();
  if (!LWC) {
    container.textContent = dashT('dash.lwcNotLoaded', 'Lightweight Charts not loaded');
    return null;
  }

  const candles = data?.candles ?? [];
  if (candles.length === 0) {
    container.textContent = dashT('dash.noCandleData', 'No candle data');
    return null;
  }

  const lwData: LwCandle[] = candles.map(toLwCandle);

  const tfShowTime = !(opts.timeframe === '1d' || opts.timeframe === '1w');

  const chart = LWC.createChart(container, {
    autoSize: true, // fill container — no manual width/height needed
    layout: {
      background: { type: 'solid', color: '#10141d' },
      textColor: '#a3adc2',
      fontSize: 12,
    },
    grid: {
      vertLines: { color: '#262f45' },
      horzLines: { color: '#262f45' },
    },
    crosshair: { mode: LWC.CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: '#333f5c',
      // some bottom padding for volume without going negative on wide-range charts
      scaleMargins: { top: 0.1, bottom: 0.15 },
    },
    timeScale: {
      borderColor: '#333f5c',
      timeVisible: tfShowTime,
      secondsVisible: false,
      rightOffset: 30,
    },
    handleScroll: true,
    handleScale: true,
  });

  const csOpts = {
    upColor: UP_COLOR,
    downColor: DOWN_COLOR,
    borderUpColor: UP_COLOR,
    borderDownColor: DOWN_COLOR,
    wickUpColor: UP_COLOR,
    wickDownColor: DOWN_COLOR,
  };
  // v4+ uses addSeries(type, opts); v3 uses addCandlestickSeries(opts)
  const series: LwSeries =
    typeof chart.addCandlestickSeries === 'function'
      ? chart.addCandlestickSeries(csOpts)
      : chart.addSeries!(LWC.CandlestickSeries, csOpts);

  series.setData(lwData);

  /* ── Auto precision: show enough decimals for the price magnitude ── */
  const lastCandle = candles[candles.length - 1]!;
  series.applyOptions({
    priceFormat: { type: 'price', precision: initialPrecision(lastCandle.c), minMove: minMoveFor(initialPrecision(lastCandle.c)) },
  });

  /* ── Tracked price lines (updatable via the controller methods) ── */
  let entryLine: LwPriceLine | null = null;
  let priceLine: LwPriceLine | null = null;
  let orderLines: LwPriceLine[] = [];
  let pos: OrdersPosition | null = data?.position ?? null;
  let lastClose = lastCandle.c;

  if (pos && pos.entry) {
    entryLine = series.createPriceLine({
      price: pos.entry,
      color: positionEntryColor(lastClose, pos.entry, pos.side),
      lineWidth: 2,
      lineStyle: LWC.LineStyle.Solid,
      axisLabelVisible: true,
      title: dashT('dash.entry', 'Entry'),
      autoscaleInfoProvider: () => null,
    });
  }

  if (lastClose > 0) {
    priceLine = series.createPriceLine({
      price: lastClose,
      color: PRICE_COLOR,
      lineWidth: 1,
      lineStyle: LWC.LineStyle.Dotted,
      axisLabelVisible: true,
      title: dashT('dash.price', 'Price'),
      autoscaleInfoProvider: () => null,
    });
  }

  for (const o of data?.orders ?? []) {
    orderLines.push(
      series.createPriceLine({
        price: o.price,
        color: o.side === 'sell' ? DOWN_COLOR : UP_COLOR,
        lineWidth: 1,
        lineStyle: LWC.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
        autoscaleInfoProvider: () => null,
      })
    );
  }

  /* ── Volume histogram ── */
  let volData: LwVolume[] = candles.map(toLwVolume);
  const volOpts = { priceFormat: { type: 'volume' }, priceScaleId: 'vol' };
  const volSeries: LwSeries =
    typeof chart.addHistogramSeries === 'function'
      ? chart.addHistogramSeries(volOpts)
      : chart.addSeries!(LWC.HistogramSeries, volOpts);
  try {
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    });
  } catch {
    /* legacy swallowed a missing 'vol' scale */
  }
  volSeries.setData(volData);

  /* Fit content after the browser has laid out the container. Two-phase: rAF
     for first paint, setTimeout for the autoSize ResizeObserver settling. */
  requestAnimationFrame(() => {
    chart.timeScale().fitContent();
  });
  setTimeout(() => {
    chart.timeScale().fitContent();
  }, FIT_SETTLE_MS);

  /* ── Lazy history loading: fire onLoadMore near the left edge ── */
  let loadingMore = false;
  let dataGen = 0; // generation counter — setData increments to invalidate stale prepends
  let loadMoreHandler: ((range: { from: number; to: number } | null) => void) | null = null;

  function armLoadMore(): void {
    if (!opts.onLoadMore) return;
    if (loadMoreHandler) {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(loadMoreHandler);
      } catch {
        /* legacy try/catch */
      }
    }
    loadMoreHandler = (range) => {
      if (!range) return;
      if (loadingMore) return;
      if (range.from < LOAD_MORE_EDGE_BARS) {
        loadingMore = true;
        const gen = dataGen;
        const first = lwData[0];
        if (!first) return; // defensive: legacy dereferenced blindly
        opts.onLoadMore!(first.time * 1000, () => {
          if (gen === dataGen) loadingMore = false;
        });
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(loadMoreHandler);
  }
  armLoadMore();

  return {
    chart,
    series,
    updateCandle(candle: RawCandle): void {
      const t = Math.floor(candle[0] / 1000);
      lastClose = candle[4];
      series.update({ time: t, open: candle[1], high: candle[2], low: candle[3], close: candle[4] });
      volSeries.update({
        time: t,
        value: candle[5],
        color: candle[4] >= candle[1] ? VOL_UP : VOL_DOWN,
      });
      // market-price line follows the latest close
      if (priceLine) {
        priceLine.applyOptions({ price: lastClose });
      } else if (lastClose > 0) {
        priceLine = series.createPriceLine({
          price: lastClose,
          color: PRICE_COLOR,
          lineWidth: 1,
          lineStyle: LWC.LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Price', // legacy literal (render.js:3491), not dashT
          autoscaleInfoProvider: () => null,
        });
      }
      // entry-line color tracks profit/loss vs the latest close
      if (entryLine && pos && pos.entry) {
        entryLine.applyOptions({ color: positionEntryColor(candle[4], pos.entry, pos.side) });
      }
    },
    updatePosition(posData: OrdersPosition | null): void {
      if (entryLine) {
        try {
          series.removePriceLine(entryLine);
        } catch {
          /* legacy try/catch */
        }
        entryLine = null;
      }
      if (posData && posData.entry && posData.entry > 0) {
        pos = posData;
        entryLine = series.createPriceLine({
          price: posData.entry,
          color: positionEntryColor(lastClose, posData.entry, posData.side),
          lineWidth: 2,
          lineStyle: LWC.LineStyle.Solid,
          axisLabelVisible: true,
          title: dashT('dash.entry', 'Entry'),
          autoscaleInfoProvider: () => null,
        });
      }
    },
    updateOrders(ordersList: Array<{ price: number; side?: string }>): void {
      // the legacy _statusSpan branch was dead (typeof guard on an undefined
      // closure variable, render.js:3524-3526) — not ported
      for (const line of orderLines) {
        try {
          series.removePriceLine(line);
        } catch {
          /* legacy try/catch */
        }
      }
      orderLines = [];
      if (ordersList && ordersList.length > 0) {
        for (const ord of ordersList) {
          orderLines.push(
            series.createPriceLine({
              price: ord.price,
              color: ord.side === 'sell' ? DOWN_COLOR : UP_COLOR,
              lineWidth: 1,
              lineStyle: LWC.LineStyle.Dashed,
              axisLabelVisible: true,
              title: '',
              autoscaleInfoProvider: () => null,
            })
          );
        }
      }
    },
    prependData(olderCandles: Candle[], gen?: number): void {
      // skip stale calls from a previous timeframe
      if (gen !== undefined && gen !== dataGen) return;
      const newLw = olderCandles.map(toLwCandle);
      const newVol = olderCandles.map(toLwVolume);
      /* merge new first, then existing — deduplicate by time, no re-fit (R8) */
      const mergedCandles = mergeByTime(lwData, newLw);
      lwData.length = 0;
      lwData.push(...mergedCandles);
      const mergedVol = mergeByTime(volData, newVol);
      volData.length = 0;
      volData.push(...mergedVol);
      series.setData(lwData);
      volSeries.setData(volData);
    },
    setData(newCandles: Candle[]): void {
      // full candle replacement (timeframe switch) — no chart rebuild
      dataGen++; // invalidate any in-flight prependData calls
      loadingMore = false; // allow fresh onLoadMore triggers
      const nextCandles = newCandles.map(toLwCandle);
      lwData.length = 0;
      lwData.push(...nextCandles);
      volData = newCandles.map(toLwVolume);
      // recalibrate precision for the new price range
      if (newCandles.length > 0) {
        const lastPrice = newCandles[newCandles.length - 1]!.c;
        const precision = setDataPrecision(lastPrice);
        series.applyOptions({
          priceFormat: { type: 'price', precision, minMove: minMoveFor(precision) },
        });
        lastClose = lastPrice;
        if (priceLine) priceLine.applyOptions({ price: lastPrice });
      }
      // auto-detect the timeframe from data spacing and update the time axis
      if (newCandles.length >= 2) {
        const span = newCandles[1]!.t - newCandles[0]!.t;
        const showTime = span < 86400000; // sub-day interval → show time
        chart.applyOptions({ timeScale: { timeVisible: showTime, secondsVisible: false } });
      }
      series.setData(lwData);
      volSeries.setData(volData);
      chart.timeScale().fitContent();
      // re-arm the load-more handler for the new dataset
      armLoadMore();
    },
    gen(): number {
      return dataGen;
    },
    destroy(): void {
      chart.remove();
    },
    chartInstance: chart,
  };
}
