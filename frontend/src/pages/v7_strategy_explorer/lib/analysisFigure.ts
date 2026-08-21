import { plotCandleInfo, plotCandlePayload } from './candles';
import { deepGet, esc, fmt } from './format';
import type { PlotlyTrace } from './plotlyVendor';
import type { CandlePlotInfo } from './candles';
import type { FillEvent, StrategySnapshot } from '../types';

/**
 * Analysis/simulation figure spec — the pure port of renderPlot
 * (:1391-1701). The legacy function mutated a DOM node via Plotly.react;
 * here the spec (traces/shapes/annotations/y-range) is returned and the
 * component hands it to Plotly. The candle zoom handler (:656-691) is
 * installed separately by the plot component.
 */

export interface AnalysisFigure {
  traces: PlotlyTrace[];
  shapes: PlotlyTrace[];
  annotations: PlotlyTrace[];
  yRange: [number, number] | null;
  plotInfo: CandlePlotInfo;
}

type Shape = Record<string, unknown>;

export function buildAnalysisFigure(
  sideKey: 'long' | 'short',
  snapshot: StrategySnapshot,
  simEvents: FillEvent[] | null,
  t: (key: string, params?: Record<string, unknown>) => string
): AnalysisFigure {
  const side = (snapshot.sides || {})[sideKey] || {};
  const market = snapshot.market || {};
  const traces: PlotlyTrace[] = [];
  const candles = snapshot.candles || [];
  const plotInfo = plotCandleInfo(candles);
  const plotCandles = plotInfo.candles;
  if (plotCandles.length) {
    const candlePayload = plotCandlePayload(plotInfo);
    traces.push({
      type: 'candlestick',
      name: candlePayload.name,
      x: candlePayload.x,
      open: candlePayload.open,
      high: candlePayload.high,
      low: candlePayload.low,
      close: candlePayload.close,
    });
  }
  const entries = deepGet<[]>(side, ['orders', 'entries'], []);
  const closes = deepGet<[]>(side, ['orders', 'closes'], []);
  const normalEntries = deepGet<[]>(side, ['orders', 'normal_entries'], entries);
  const gridEntries = deepGet<[]>(side, ['orders', 'gridonly_entries'], normalEntries);
  const gridCloses = deepGet<[]>(side, ['orders', 'gridonly_closes'], closes);
  const trailingEntries = deepGet<[]>(side, ['orders', 'simulated_entry_trailing'], []);
  const potentialTrailingPrices = deepGet<number[]>(side, ['orders', 'potential_entry_trailing_prices'], []);
  const params = side.visual_params || side.params || {};
  const visualParams = (side.visual_params || params) as Record<string, unknown>;
  const stateParams = (deepGet<Record<string, unknown>>(side, ['debug', 'state_params'], {}) || {}) as Record<string, unknown>;
  const trailingBundle = (deepGet<Record<string, unknown>>(side, ['debug', 'entry_input', 'tb'], {}) || {}) as Record<string, unknown>;
  const entryMode = deepGet<string>(side, ['modes', 'entry'], 'GridOnly');
  const closeMode = deepGet<string>(side, ['modes', 'close'], 'GridOnly');
  const x0 = candles.length ? candles[0]!.timestamp : 0;
  const x1 = candles.length ? candles[candles.length - 1]!.timestamp : 1;
  const shapes: Shape[] = [];
  const annotations: PlotlyTrace[] = [];
  const yValues: number[] = [];
  const xHoverSamples = buildHoverSamples();

  function num(value: unknown, fallback?: number): number {
    const n = Number(value);
    return isFinite(n) ? n : (fallback === undefined ? 0 : fallback);
  }
  const marketRef = num(market.reference_price, 100);
  let ref =
    sideKey === 'long'
      ? num(deepGet<number>(stateParams, ['ema_bands', 'lower'], marketRef), marketRef)
      : num(deepGet<number>(stateParams, ['ema_bands', 'upper'], marketRef), marketRef);
  if (!isFinite(ref) || ref <= 0) ref = marketRef;

  function buildHoverSamples(): (string | number)[] {
    if (!candles.length) return [x0, x1];
    const count = Math.min(120, candles.length);
    if (count <= 1) return [candles[0]!.timestamp];
    const out: (string | number)[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i * (candles.length - 1)) / (count - 1));
      out.push(candles[idx]!.timestamp);
    }
    return out;
  }
  function orderPrices(orders: unknown[]): number[] {
    return (orders || []).map((o) => num((o as { price?: number }).price, NaN)).filter((v) => isFinite(v) && v > 0);
  }
  function priceOrders(prices: number[]): { index: number; price: number }[] {
    return (prices || [])
      .map((price, idx) => ({ index: idx + 1, price: num(price, NaN) }))
      .filter((o) => isFinite(o.price) && o.price > 0);
  }
  function addY(values: unknown[]): void {
    (values || []).forEach((v) => {
      const n = num(v, NaN);
      if (isFinite(n) && n > 0) yValues.push(n);
    });
  }
  function bounds(values: unknown[]): [number, number] | null {
    const nums = (values || [])
      .filter((v) => isFinite(num(v, NaN)) && num(v, NaN) > 0)
      .map(Number);
    if (!nums.length) return null;
    return [Math.min(...nums), Math.max(...nums)];
  }
  function minValue(values: unknown[], fallback: number): number {
    const b = bounds(values);
    return b ? b[0] : fallback;
  }
  function maxValue(values: unknown[], fallback: number): number {
    const b = bounds(values);
    return b ? b[1] : fallback;
  }
  function rangeHasWidth(b: [number, number] | null): b is [number, number] {
    return !!b && Math.abs(num(b[1], NaN) - num(b[0], NaN)) > 1e-12;
  }
  function addBand(y0: unknown, y1: unknown, fill: string): boolean {
    const a = num(y0, NaN);
    const b = num(y1, NaN);
    if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0 || Math.abs(b - a) <= 1e-12) return false;
    shapes.push({
      type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: Math.min(a, b), y1: Math.max(a, b),
      fillcolor: fill, opacity: 1, layer: 'below', line: { width: 0 },
    });
    addY([a, b]);
    return true;
  }
  function addShapeLine(y: unknown, color: string, dash: string, width = 1): void {
    const v = num(y, NaN);
    if (!isFinite(v) || v <= 0) return;
    shapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: v, y1: v, line: { color, dash, width }, layer: 'above' });
    addY([v]);
  }
  function legendLine(name: string, color: string, dash: string, width: number, group: string): void {
    traces.push({ x: [null], y: [null], mode: 'lines', name, line: { color, dash, width: width || 1 }, legendgroup: group, showlegend: true });
  }
  function legendBand(name: string, color: string, group: string): void {
    traces.push({ x: [null], y: [null], mode: 'lines', name, line: { color, width: 10 }, legendgroup: group, showlegend: true });
  }
  function lineTrace(orders: { index?: number; price?: number }[], name: string, color: string, dash: string): PlotlyTrace {
    const xs: (string | number | null)[] = [];
    const ys: (number | null)[] = [];
    const text: string[] = [];
    orders.forEach((o) => {
      xs.push(x0, x1, null);
      ys.push(o.price ?? null, o.price ?? null, null);
      const label = name + ' ' + o.index + ': ' + fmt(o.price, 8);
      text.push(label, label, '');
    });
    return { x: xs, y: ys, text, mode: 'lines', name, line: { color, dash: dash || 'dash', width: 1 }, hovertemplate: '%{text}<extra></extra>' };
  }
  function hoverLineTrace(prices: unknown[], name: string, group: string): PlotlyTrace | null {
    const xs: (string | number | null)[] = [];
    const ys: (number | null)[] = [];
    const text: string[] = [];
    (prices || []).forEach((price) => {
      const y = num(price, NaN);
      if (!isFinite(y) || y <= 0) return;
      xHoverSamples.forEach((x) => {
        xs.push(x);
        ys.push(y);
        text.push(name + ': ' + fmt(y, 8));
      });
      xs.push(null);
      ys.push(null);
      text.push('');
    });
    if (!ys.length) return null;
    return {
      x: xs, y: ys, text, mode: 'markers', name: name + ' (hover)', showlegend: false, legendgroup: group,
      marker: { size: 8, color: 'rgba(0,0,0,0)' }, hovertemplate: '%{text}<extra></extra>',
    };
  }
  function addHoverLine(prices: unknown[], name: string, group: string): void {
    const trace = hoverLineTrace(prices, name, group);
    if (trace) traces.push(trace);
  }
  function fillTrace(events: FillEvent[] | null, tradeSide: 'buy' | 'sell', name: string, color: string): PlotlyTrace {
    const xs: string[] = [];
    const ys: number[] = [];
    const text: string[] = [];
    const hover: string[] = [];
    const firstMs = candles.length ? Date.parse(candles[0]!.timestamp) : NaN;
    const lastMs = candles.length ? Date.parse(candles[candles.length - 1]!.timestamp) : NaN;
    (events || []).forEach((ev, idx) => {
      const price = Number(ev.price || ev.fill_price);
      const qty = Number(ev.qty || ev.fill_qty || 0);
      let ts: unknown = ev.timestamp || ev.time || ev.date || ev.timestamp_ms;
      if (!ts || !isFinite(price)) return;
      if (typeof ts === 'number' || /^\d+$/.test(String(ts))) ts = new Date(Number(ts)).toISOString();
      const ms = Date.parse(String(ts));
      if (isFinite(firstMs) && isFinite(lastMs) && isFinite(ms) && (ms < firstMs || ms > lastMs)) return;
      const isBuy = qty > 0;
      if ((tradeSide === 'buy' && !isBuy) || (tradeSide === 'sell' && isBuy)) return;
      xs.push(String(ts));
      ys.push(price);
      addY([price]);
      text.push(isBuy ? 'B' : 'S');
      hover.push('#' + (idx + 1) + ' ' + name + '<br>' + esc(ev.order_type || ev.event || ev.type || '-') + '<br>qty: ' + fmt(qty, 8) + '<br>price: ' + fmt(price, 8));
    });
    return {
      x: xs, y: ys, text, hovertext: hover, mode: 'markers+text', name,
      marker: { color, size: 20, symbol: 'circle', opacity: 0.95, line: { color: '#020617', width: 2 } },
      textfont: { color: '#ffffff', size: 11, family: 'Arial Black, Arial, sans-serif' },
      textposition: 'middle center', hovertemplate: '%{hovertext}<extra></extra>',
    };
  }

  const entryPrices = orderPrices(normalEntries);
  const closePrices = orderPrices(closes);
  const gridEntryPrices = orderPrices(gridEntries);
  const gridClosePrices = orderPrices(gridCloses);
  const trailingEntryPrices = orderPrices(trailingEntries);
  const shownTrailingOrders = entryMode !== 'GridOnly' && trailingEntryPrices.length ? trailingEntries : priceOrders(potentialTrailingPrices);
  const shownTrailingPrices = orderPrices(shownTrailingOrders as unknown[]);
  const shownTrailingName = entryMode !== 'GridOnly' && trailingEntryPrices.length ? 'Entry Trailing (Simulated Steps)' : 'Entry Trailing (Potential Zone)';
  addY(candles.map((c) => c.high));
  addY(candles.map((c) => c.low));
  addY(entryPrices);
  addY(closePrices);
  addY(gridEntryPrices);
  addY(gridClosePrices);
  addY(shownTrailingPrices);
  addY([ref]);

  const entryBounds = bounds(entryPrices);
  const closeBounds = bounds(closePrices);
  if (entryBounds) {
    if (addBand(entryBounds[0], entryBounds[1], 'rgba(255, 0, 0, 0.16)')) legendBand('Entry Grid (Range)', 'rgba(255,0,0,0.18)', 'entry_range');
  }
  if (closeBounds) {
    if (addBand(closeBounds[0], closeBounds[1], 'rgba(0, 255, 0, 0.14)')) legendBand('Close Grid (Area)', 'rgba(0,255,0,0.18)', 'close_range');
  }

  if (entryMode !== 'GridOnly') {
    const fgEntryMin = minValue(gridEntryPrices, minValue(entryPrices, 0));
    const fgEntryMax = maxValue(gridEntryPrices, maxValue(entryPrices, 0));
    const nEntryMin = minValue(entryPrices, fgEntryMin);
    const nEntryMax = maxValue(entryPrices, fgEntryMax);
    const thresholdPct = num(visualParams.entry_trailing_threshold_pct, 0);
    const boundaryPrice = num(deepGet<number>(side, ['debug', 'potential_trailing', 'gridfirst_cutoff_price'], 0), 0);
    let entryTrailingBounds: [number, number] | null = null;
    if (fgEntryMin > 0 && fgEntryMax > 0) {
      if (entryMode === 'GridFirst' && sideKey === 'long') {
        const startLong = boundaryPrice > 0 ? boundaryPrice : nEntryMin;
        entryTrailingBounds = bounds([Math.min(fgEntryMin, startLong * (1 - thresholdPct)), startLong]);
      } else if (entryMode === 'GridFirst') {
        const startShort = boundaryPrice > 0 ? boundaryPrice : nEntryMax;
        entryTrailingBounds = bounds([startShort, Math.max(fgEntryMax, startShort * (1 + thresholdPct))]);
      } else if (entryMode === 'TrailingFirst' && sideKey === 'long') {
        entryTrailingBounds = bounds([Math.min(fgEntryMin, ref * (1 - thresholdPct)), Math.max(fgEntryMax, ref)]);
      } else if (entryMode === 'TrailingFirst') {
        entryTrailingBounds = bounds([Math.min(fgEntryMin, ref), Math.max(fgEntryMax, ref * (1 + thresholdPct))]);
      } else if (entryMode === 'TrailingOnly' && sideKey === 'long') {
        entryTrailingBounds = bounds([Math.min(fgEntryMin, ref * (1 - thresholdPct)), Math.max(fgEntryMax, ref)]);
      } else if (entryMode === 'TrailingOnly') {
        entryTrailingBounds = bounds([Math.min(fgEntryMin, ref), Math.max(fgEntryMax, ref * (1 + thresholdPct))]);
      }
    }
    if (rangeHasWidth(entryTrailingBounds)) {
      if (addBand(entryTrailingBounds[0], entryTrailingBounds[1], 'rgba(200, 100, 0, 0.22)'))
        legendBand('Entry Trailing (Conditional Zone)', 'rgba(200, 100, 0, 0.28)', 'entry_trailing');
    }
  }

  if (closeMode !== 'GridOnly' && gridClosePrices.length && closePrices.length) {
    let closeTrailingBounds: [number, number] | null = null;
    if (sideKey === 'long') {
      closeTrailingBounds =
        closeMode === 'GridFirst'
          ? bounds([Math.max(...closePrices), Math.max(...gridClosePrices)])
          : bounds([Math.min(...gridClosePrices), Math.min(...closePrices)]);
    } else {
      closeTrailingBounds =
        closeMode === 'GridFirst'
          ? bounds([Math.min(...gridClosePrices), Math.min(...closePrices)])
          : bounds([Math.max(...closePrices), Math.max(...gridClosePrices)]);
    }
    if (closeTrailingBounds) {
      addBand(closeTrailingBounds[0], closeTrailingBounds[1], 'rgba(0, 0, 255, 0.18)');
      legendBand('Close Trailing (Conditional Zone)', 'rgba(0,0,255,0.22)', 'close_trailing');
    }
  }

  traces.push(lineTrace(normalEntries, 'Entry Grid (Lines)', '#ff4b4b', 'dash'));
  addHoverLine(entryPrices, 'Entry Grid', 'entry');
  traces.push(lineTrace(closes, 'Close Grid (Lines)', '#21c354', 'dot'));
  addHoverLine(closePrices, 'Close Grid', 'close');
  if (entryMode !== 'GridOnly' && shownTrailingPrices.length) {
    traces.push(lineTrace(shownTrailingOrders as { index?: number; price?: number }[], shownTrailingName, '#ff8c00', 'dash'));
    addHoverLine(shownTrailingPrices, shownTrailingName, 'entry_trailing');
  }
  addShapeLine(ref, '#b77dff', 'solid', 3);
  legendLine('EMA Band', '#b77dff', 'solid', 3, 'ema');
  addHoverLine([ref], 'EMA Band', 'ema');

  const analysisTs =
    deepGet<string>(market, ['metadata', 'ohlcv', 'grid_time'], '') ||
    deepGet<string>(market, ['metadata', 'ohlcv', 'selected_start'], '') ||
    x1;
  if (candles.length && analysisTs) {
    shapes.push({ type: 'line', xref: 'x', x0: analysisTs, x1: analysisTs, yref: 'paper', y0: 0, y1: 1, line: { color: 'cyan', dash: 'dot', width: 2 }, layer: 'above' });
    annotations.push({ x: analysisTs, y: 1, xref: 'x', yref: 'paper', text: t('v7explore.analysisTime'), showarrow: false, xanchor: 'left', yanchor: 'bottom', font: { color: 'cyan', size: 11 } });
  }

  if (entryMode !== 'GridOnly') {
    const entryRef = entryPrices.length ? entryPrices[0]! : ref;
    const eth = sideKey === 'long' ? entryRef * (1 - num(visualParams.entry_trailing_threshold_pct, 0)) : entryRef * (1 + num(visualParams.entry_trailing_threshold_pct, 0));
    if (num(visualParams.entry_trailing_threshold_pct, 0) > 0) {
      addShapeLine(eth, 'rgba(255, 255, 0, 0.6)', 'dash', 1);
      legendLine('Trailing Start (Threshold)', 'rgba(255, 255, 0, 0.6)', 'dash', 1, 'entry_trailing');
      addHoverLine([eth], 'Trailing Start (Threshold)', 'entry_trailing');
    }
    if (num(visualParams.entry_trailing_retracement_pct, 0) > 0) {
      const retr =
        num(visualParams.entry_trailing_threshold_pct, 0) > 0
          ? sideKey === 'long'
            ? entryRef * (1 - num(visualParams.entry_trailing_threshold_pct, 0) + num(visualParams.entry_trailing_retracement_pct, 0))
            : entryRef * (1 + num(visualParams.entry_trailing_threshold_pct, 0) - num(visualParams.entry_trailing_retracement_pct, 0))
          : sideKey === 'long'
            ? num(trailingBundle.min_since_open, entryRef) * (1 + num(visualParams.entry_trailing_retracement_pct, 0))
            : num(trailingBundle.max_since_open, entryRef) * (1 - num(visualParams.entry_trailing_retracement_pct, 0));
      addShapeLine(retr, 'rgba(255, 255, 0, 0.35)', 'dot', 1);
      legendLine('Trailing Trigger (Retracement, conditional)', 'rgba(255, 255, 0, 0.35)', 'dot', 1, 'entry_trailing');
      addHoverLine([retr], 'Trailing Trigger (Retracement, conditional)', 'entry_trailing');
      if (num(visualParams.entry_trailing_threshold_pct, 0) > 0) {
        addBand(eth, retr, 'rgba(255, 255, 0, 0.08)');
        legendBand('Entry Trailing (Conditional Trigger Zone)', 'rgba(255, 255, 0, 0.12)', 'entry_trailing');
      }
    }
  }

  if (closeMode !== 'GridOnly') {
    const closeRef = num(deepGet<number>(side, ['debug', 'position_close', 'price'], 0), 0) || ref;
    if (num(visualParams.close_trailing_threshold_pct, 0) > 0) {
      const closeThr = sideKey === 'long' ? closeRef * (1 + num(visualParams.close_trailing_threshold_pct, 0)) : closeRef * (1 - num(visualParams.close_trailing_threshold_pct, 0));
      addShapeLine(closeThr, 'rgba(0, 255, 255, 0.6)', 'dash', 1);
      legendLine('Close Trailing Start (Threshold, conditional)', 'rgba(0, 255, 255, 0.6)', 'dash', 1, 'close_trailing');
      addHoverLine([closeThr], 'Close Trailing Start (Threshold, conditional)', 'close_trailing');
    }
    if (num(visualParams.close_trailing_retracement_pct, 0) > 0) {
      const closeRetr =
        sideKey === 'long'
          ? num(trailingBundle.max_since_open, closeRef) * (1 - num(visualParams.close_trailing_retracement_pct, 0))
          : num(trailingBundle.min_since_open, closeRef) * (1 + num(visualParams.close_trailing_retracement_pct, 0));
      addShapeLine(closeRetr, 'rgba(0, 255, 255, 0.35)', 'dot', 1);
      legendLine('Close Trailing Trigger (Retracement, conditional)', 'rgba(0, 255, 255, 0.35)', 'dot', 1, 'close_trailing');
      addHoverLine([closeRetr], 'Close Trailing Trigger (Retracement, conditional)', 'close_trailing');
    }
  }

  if (simEvents !== null) {
    traces.push(fillTrace(simEvents, 'buy', 'Buy Fills', '#16a34a'));
    traces.push(fillTrace(simEvents, 'sell', 'Sell Fills', '#dc2626'));
  }

  let yRange: [number, number] | null = null;
  if (yValues.length) {
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yPad = Math.max(Math.abs(yMax - yMin) * 0.05, Math.abs(yMax || 1) * 0.001);
    yRange = [yMin - yPad, yMax + yPad];
  }
  return { traces, shapes, annotations, yRange, plotInfo };
}

/** The dark Plotly layout of renderPlot (:1690-1700). */
export function analysisLayout(
  fig: AnalysisFigure,
  sideKey: 'long' | 'short',
  t: (key: string, params?: Record<string, unknown>) => string
): Record<string, unknown> {
  return {
    paper_bgcolor: '#1b191d',
    plot_bgcolor: '#1b191d',
    font: { color: '#fafafa' },
    title: t('v7explore.entryCloseGridsVisualization', { side: sideKey.toUpperCase() }),
    margin: { l: 55, r: 25, t: 45, b: 35 },
    shapes: fig.shapes,
    annotations: fig.annotations,
    xaxis: {
      type: 'date',
      title: t('v7explore.date'),
      gridcolor: '#333640',
      rangeslider: { visible: fig.plotInfo.bucketSize <= 1, bgcolor: '#151922', bordercolor: '#333640', thickness: 0.16 },
    },
    yaxis: { title: t('v7explore.price'), gridcolor: '#333640', range: fig.yRange || undefined },
    hovermode: 'closest',
    hoverdistance: 30,
    legend: { orientation: 'h', bgcolor: 'rgba(0,0,0,0)', bordercolor: 'rgba(0,0,0,0)' },
  };
}
