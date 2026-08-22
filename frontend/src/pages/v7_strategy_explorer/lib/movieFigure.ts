import { deepGet, esc, fmt, fmtFixed } from './format';
import type { PlotlyFrame, PlotlyLayout, PlotlyTrace } from './plotlyVendor';
import type { FillEvent, MovieData, MovieFrame } from '../types';

/**
 * Movie animation figure — the pure port of buildMovieFigureSpec
 * (:2562-2813). Returns the Plotly data/layout/frames spec; the MoviePlot
 * component renders it, adds the frames and wires the slider/button events
 * (:2841-2858).
 */

export interface MovieFigureInput {
  visible: number;
  stepMins: number;
  balanceFallback: number;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export interface MovieFigureSpec {
  data: PlotlyTrace[];
  layout: PlotlyLayout;
  frames: PlotlyFrame[];
  activeFrame: number;
}

interface FrameState {
  balance: number;
  posSize: number;
  posPrice: number | null;
  walletExposure: number | null;
}

export function buildMovieFigureSpec(
  data: MovieData,
  sideKey: 'long' | 'short',
  input: MovieFigureInput,
  initialFrameIdx?: number,
  movieCurrentFrame = 0
): MovieFigureSpec | null {
  const t = input.t;
  const frames = data.frames || [];
  const events = data.events || {};
  const sideEvents = (events[sideKey] || []) as FillEvent[];
  const sortedSideEvents = (sideEvents || [])
    .slice()
    .sort((a, b) => new Date(String(a.timestamp || a.time || a.date || '')).getTime() - new Date(String(b.timestamp || b.time || b.date || '')).getTime());
  if (!frames.length) return null;
  const xs = frames.map((f) => f.timestamp);
  const candle = frames.map((f) => f.candle || {});
  const visible = Math.max(10, Number(input.visible || 60));
  const traceCandles: PlotlyTrace = {
    type: 'candlestick',
    name: 'Price',
    x: xs,
    open: candle.map((c) => Number(c.open || 0)),
    high: candle.map((c) => Number(c.high || 0)),
    low: candle.map((c) => Number(c.low || 0)),
    close: candle.map((c) => Number(c.close || 0)),
  };
  const emaHigh = frames.map((f) => {
    const value = deepGet<number | null>(f, [sideKey, 'debug', 'state_params', 'ema_bands', 'upper'], null);
    return value === null ? null : Number(value);
  });
  const emaLow = frames.map((f) => {
    const value = deepGet<number | null>(f, [sideKey, 'debug', 'state_params', 'ema_bands', 'lower'], null);
    return value === null ? null : Number(value);
  });
  const hasEmaBands = emaHigh.some((value) => value !== null && isFinite(value)) && emaLow.some((value) => value !== null && isFinite(value));
  const traceEmaHigh: PlotlyTrace = { type: 'scatter', mode: 'lines', name: hasEmaBands ? 'EMA High' : '', showlegend: hasEmaBands, x: hasEmaBands ? xs : [], y: hasEmaBands ? emaHigh : [], line: { color: 'magenta', width: 1 } };
  const traceEmaLow: PlotlyTrace = { type: 'scatter', mode: 'lines', name: hasEmaBands ? 'EMA Low' : '', showlegend: hasEmaBands, x: hasEmaBands ? xs : [], y: hasEmaBands ? emaLow : [], line: { color: 'cyan', width: 1, dash: 'dot' } };

  function orderPrices(frame: MovieFrame, kind: string): number[] {
    return (deepGet<unknown[]>(frame, [sideKey, 'orders', kind], []) || [])
      .map((order) => Number((order as { price?: number }).price || 0))
      .filter((price) => isFinite(price) && price > 0);
  }
  function trailingPrice(frame: MovieFrame, kind: string, closePrice: number): number | null {
    const orders = (deepGet<unknown[]>(frame, [sideKey, 'orders', kind], []) || []) as { order_type?: string; type?: string; price?: number }[];
    const prices = orders
      .filter((order) => String(order.order_type || order.type || '').toLowerCase().indexOf('trail') >= 0)
      .map((order) => Number(order.price || 0))
      .filter((price) => isFinite(price) && price > 0);
    if (!prices.length) return null;
    return prices.sort((a, b) => Math.abs(a - closePrice) - Math.abs(b - closePrice))[0]!;
  }
  function gridTrace(prices: number[], color: string, name: string, x0: string, x1: string, width?: number): PlotlyTrace {
    const gx: (string | null)[] = [];
    const gy: (number | null)[] = [];
    (prices || []).forEach((price) => {
      gx.push(x0, x1, null);
      gy.push(price, price, null);
    });
    return {
      type: 'scatter', mode: 'lines', name, x: gx, y: gy,
      line: { color, width: width || 1, dash: 'dot' },
      hovertemplate: esc(name) + '<br>Price: %{y:.8f}<extra></extra>',
    };
  }

  /** Upcoming entry/close fill prices from the fill cycle containing the frame time (:2600-2667). */
  function upcomingFillPrices(kind: 'entry' | 'close', frameTs: string): number[] {
    const isEntry = kind === 'entry';
    const now = new Date(frameTs).getTime();
    const sorted = sortedSideEvents;
    const posEps = 1e-12;
    const cycleId = new Array<number>(sorted.length).fill(-1);
    const cycleStart: Record<number, number> = {};
    const cycleEnd: Record<number, number> = {};
    let inCycle = false;
    let cid = -1;
    let curStart = -1;
    for (let cidx = 0; cidx < sorted.length; cidx++) {
      const ps = Number(sorted[cidx]!.pos_size || 0);
      if (!inCycle && Math.abs(ps) > posEps) {
        inCycle = true;
        cid += 1;
        curStart = cidx;
      }
      if (inCycle) {
        cycleId[cidx] = cid;
        if (Math.abs(ps) <= posEps) {
          cycleStart[cid] = curStart;
          cycleEnd[cid] = cidx;
          inCycle = false;
          curStart = -1;
        }
      }
    }
    if (inCycle && curStart >= 0) {
      cycleStart[cid] = curStart;
      cycleEnd[cid] = sorted.length - 1;
    }

    let k = -1;
    for (let i = 0; i < sorted.length; i++) {
      const ts = new Date(String(sorted[i]!.timestamp || sorted[i]!.time || sorted[i]!.date || '')).getTime();
      if (isFinite(ts) && ts <= now) k = i;
      if (isFinite(ts) && ts > now) break;
    }
    const nextIdx = k + 1;
    const curPos = k >= 0 ? Number(sorted[k]!.pos_size || 0) : 0;
    const cand: number[] = [];
    if (Math.abs(curPos) <= posEps) {
      let j0 = nextIdx;
      while (j0 < sorted.length && cycleId[j0]! < 0) j0 += 1;
      if (j0 < sorted.length) {
        const nextCid = cycleId[j0]!;
        const endFlat = cycleEnd[nextCid] === undefined ? sorted.length - 1 : cycleEnd[nextCid]!;
        for (let a = j0; a <= endFlat; a++) cand.push(a);
      }
    } else {
      let activeCid = k >= 0 ? cycleId[k]! : -1;
      if (activeCid < 0 && nextIdx < sorted.length) activeCid = cycleId[nextIdx]!;
      if (activeCid >= 0) {
        const startActive = Math.max(nextIdx, cycleStart[activeCid] === undefined ? nextIdx : cycleStart[activeCid]!);
        const endActive = cycleEnd[activeCid] === undefined ? sorted.length - 1 : cycleEnd[activeCid]!;
        for (let b = startActive; b <= endActive; b++) cand.push(b);
      }
    }

    const onlyEntries = Math.abs(curPos) <= posEps;
    const out: number[] = [];
    for (let ci = 0; ci < cand.length && out.length < 200; ci++) {
      const ev = sorted[cand[ci]!]!;
      const evType = String(ev.event || '').toLowerCase();
      if (isEntry && evType.indexOf('entry') >= 0) out.push(Number(ev.price || 0));
      if (!isEntry && !onlyEntries && evType.indexOf('close') >= 0) out.push(Number(ev.price || 0));
    }
    const filtered: number[] = [];
    let best: number | null = null;
    out.forEach((price) => {
      if (best === null) {
        best = price;
        filtered.push(price);
        return;
      }
      if (sideKey === 'long') {
        if ((isEntry && price < best) || (!isEntry && price > best)) {
          best = price;
          filtered.push(price);
        }
      } else {
        if ((isEntry && price > best) || (!isEntry && price < best)) {
          best = price;
          filtered.push(price);
        }
      }
    });
    return filtered;
  }

  /** Wallet/position state of a frame from the last fill (:2668-2698). */
  function movieFrameState(frame: MovieFrame, closePrice: number): FrameState {
    const frameMs = new Date(frame.timestamp || '').getTime();
    const fillStateEnd = Number(deepGet<number>(data, ['metadata', 'displayed_fill_end_timestamp_ms'], 0) || 0);
    if (deepGet<boolean>(data, ['metadata', 'fills_truncated'], false) === true && fillStateEnd > 0 && frameMs > fillStateEnd) {
      return { balance: NaN, posSize: NaN, posPrice: null, walletExposure: null };
    }
    let last: FillEvent | null = null;
    if (isFinite(frameMs)) {
      for (let i = 0; i < sortedSideEvents.length; i++) {
        const evMs = new Date(String(sortedSideEvents[i]!.timestamp || sortedSideEvents[i]!.time || sortedSideEvents[i]!.date || '')).getTime();
        if (!isFinite(evMs)) continue;
        if (evMs <= frameMs) last = sortedSideEvents[i]!;
        if (evMs > frameMs) break;
      }
    }
    let balance = Number(last && last.wallet_balance);
    if (!isFinite(balance) || balance <= 0) balance = Number(deepGet<number>(frame, [sideKey, 'debug', 'state_params', 'balance'], input.balanceFallback || 0));
    let posSize = Number(last && last.pos_size);
    if (!isFinite(posSize)) posSize = 0;
    let posPrice = Number(last && last.pos_price);
    if (!isFinite(posPrice) || posPrice <= 0) posPrice = NaN;
    let walletExposure = Number(last && last.wallet_exposure);
    if (!isFinite(walletExposure)) {
      if (isFinite(balance) && balance > 0 && isFinite(posPrice)) walletExposure = Math.abs(posSize * posPrice) / balance;
      else if (isFinite(balance) && balance > 0 && isFinite(closePrice) && closePrice > 0) walletExposure = Math.abs(posSize * closePrice) / balance;
      else walletExposure = NaN;
    } else {
      walletExposure = Math.abs(walletExposure);
    }
    return { balance, posSize, posPrice: isFinite(posPrice) ? posPrice : null, walletExposure: isFinite(walletExposure) ? walletExposure : null };
  }

  /** Fill markers snapped into the visible window with stacking (:2699-2758). */
  function fillsTrace(startIdx: number, endIdx: number, x0: string, x1: string): PlotlyTrace {
    const fx: string[] = [];
    const fy: number[] = [];
    const text: string[] = [];
    const colors: string[] = [];
    const custom: unknown[][] = [];
    const stepMs = Math.max(1, Number(input.stepMins || 1)) * 60000;
    const start = new Date(x0).getTime() - stepMs;
    const end = new Date(x1).getTime();
    const frameTimes = xs.slice(startIdx, endIdx + 1).map((x) => new Date(String(x)).getTime());
    const frameOffset = Math.max(0, startIdx);
    const stackCounts: Record<string, number> = {};
    const yStackCounts: Record<string, number> = {};
    function plotDate(ms: number): string {
      return new Date(ms).toISOString();
    }
    function stackStep(n: number): number {
      if (n <= 0) return 0;
      const k = Math.floor((n + 1) / 2);
      return n % 2 === 1 ? k : -k;
    }
    (sideEvents || []).forEach((ev, idx) => {
      const ts = new Date(String(ev.timestamp || ev.time || ev.date || '')).getTime();
      const price = Number(ev.price || 0);
      const qty = Number(ev.qty || 0);
      if (!isFinite(ts) || ts < start || ts > end || !isFinite(price) || price <= 0 || !isFinite(qty) || qty === 0) return;
      const isBuy = qty > 0;
      let snapped = ts;
      let snapIdx = frameTimes.length ? frameTimes.length - 1 : 0;
      for (let i = 0; i < frameTimes.length; i++) {
        if (frameTimes[i]! >= ts) {
          snapped = frameTimes[i]!;
          snapIdx = i;
          break;
        }
      }
      if (snapped < new Date(x0).getTime()) snapped = new Date(x0).getTime();
      if (snapped > end) snapped = end;
      const candleIdx = Math.min(frames.length - 1, Math.max(0, frameOffset + snapIdx));
      const c = frames[candleIdx] ? frames[candleIdx]!.candle || {} : {};
      let low = Number(c.low || price);
      let high = Number(c.high || price);
      let y = price;
      if (isFinite(low) && isFinite(high)) {
        if (low > high) {
          const tmp = low;
          low = high;
          high = tmp;
        }
        y = Math.min(Math.max(y, low), high);
      }
      const yKey = String(snapped) + ':' + String(Math.round(y * 1e12) / 1e12);
      const yn = yStackCounts[yKey] || 0;
      yStackCounts[yKey] = yn + 1;
      if (yn > 0 && isFinite(low) && isFinite(high) && high > low) {
        const mid = (low + high) / 2;
        const yStep = Math.max((high - low) * 0.025, Math.abs(y) * 0.00025, 1e-12);
        const yDir = y >= mid ? -1 : 1;
        y = Math.min(Math.max(y + yDir * yn * yStep, low), high);
      }
      const key = String(snapped) + ':' + (isBuy ? 'B' : 'S');
      const n = stackCounts[key] || 0;
      stackCounts[key] = n + 1;
      const offset = Math.max(-8, Math.min(8, (isBuy ? -1 : 1) + stackStep(n)));
      const jitter = Math.max(1, (stepMs * 0.002) / 1000);
      fx.push(plotDate(snapped + offset * jitter * 1000));
      fy.push(y);
      text.push(isBuy ? 'B' : 'S');
      colors.push(isBuy ? 'rgba(143, 181, 147, 1.0)' : 'rgba(197, 142, 138, 1.0)');
      custom.push([idx + 1, Math.abs(qty), ev.event || ev.type || '', ev.order_type || '', ev.timestamp || ev.time || ev.date || '', price]);
    });
    return {
      type: 'scatter', mode: 'markers+text', name: 'Fills (B/S)', x: fx, y: fy, text, textposition: 'middle center',
      textfont: { color: 'white', size: 12 },
      marker: { symbol: 'circle', size: 18, color: colors, line: { color: 'rgba(0, 0, 0, 0.7)', width: 1 } },
      customdata: custom,
      hovertemplate: '%{text} #%{customdata[0]} (%{customdata[2]})<br>qty=%{customdata[1]:.6f}<br>price=%{customdata[5]:.6f}<br>type=%{customdata[3]}<br>%{customdata[4]}<extra></extra>',
    };
  }

  /** Per-frame data/layout (:2760-2801). */
  function dynamicFrame(frame: MovieFrame, idx: number): PlotlyFrame {
    const startIdx = Math.max(0, idx - visible + 1);
    let x0 = xs[startIdx] as string;
    const x1 = frame.timestamp;
    if (x0 === x1) {
      const d0 = new Date(new Date(x1).getTime() - Math.max(1, Number(input.stepMins || 1)) * 60000);
      x0 =
        d0.getFullYear() +
        '-' +
        String(d0.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d0.getDate()).padStart(2, '0') +
        'T' +
        String(d0.getHours()).padStart(2, '0') +
        ':' +
        String(d0.getMinutes()).padStart(2, '0') +
        ':' +
        String(d0.getSeconds()).padStart(2, '0');
    }
    const entryPrices = orderPrices(frame, 'entries');
    const closePrices = orderPrices(frame, 'closes');
    const closePrice = Number(deepGet<number>(frame, ['candle', 'close'], 0));
    const useFillPreview = data.engine === 'pb7_fills' || data.engine === 'pb7_engine' || data.engine === 'pb8_engine' || data.engine === 'pb8_native_replay';
    const upcomingEntries = useFillPreview ? upcomingFillPrices('entry', frame.timestamp) : [];
    const upcomingCloses = useFillPreview ? upcomingFillPrices('close', frame.timestamp) : [];
    const trailEntry = trailingPrice(frame, 'entries', closePrice);
    const trailClose = trailingPrice(frame, 'closes', closePrice);
    const currentTrace: PlotlyTrace = { type: 'scatter', mode: 'lines', name: 'Current Price', x: [x0, x1], y: [closePrice, closePrice], line: { color: '#c4a67e', width: 2 } };
    const traceEntries = useFillPreview ? gridTrace(upcomingEntries, 'rgba(197, 142, 138, 0.75)', 'Upcoming Entries', x0, x1, 2) : gridTrace(entryPrices, 'rgba(197, 142, 138, 0.6)', 'Entry Grid', x0, x1);
    const traceCloses = useFillPreview ? gridTrace(upcomingCloses, 'rgba(143, 181, 147, 0.75)', 'Upcoming Closes', x0, x1, 2) : gridTrace(closePrices, 'rgba(143, 181, 147, 0.6)', 'Close Grid', x0, x1);
    const traceTrailEntry: PlotlyTrace = trailEntry === null ? { type: 'scatter', mode: 'lines', name: 'Next Trailing Entry', x: [], y: [] } : gridTrace([trailEntry], 'rgba(196, 166, 126, 0.9)', 'Next Trailing Entry', x0, x1, 3);
    const traceTrailClose: PlotlyTrace = trailClose === null ? { type: 'scatter', mode: 'lines', name: 'Next Trailing Close', x: [], y: [] } : gridTrace([trailClose], 'rgba(139, 167, 194, 0.9)', 'Next Trailing Close', x0, x1, 3);
    let yVals: number[] = [];
    for (let j = startIdx; j <= idx; j++) {
      yVals.push(Number(deepGet<number>(frames[j], ['candle', 'high'], 0)), Number(deepGet<number>(frames[j], ['candle', 'low'], 0)), emaHigh[j] ?? NaN, emaLow[j] ?? NaN);
    }
    yVals = yVals.concat(useFillPreview ? upcomingEntries : entryPrices, useFillPreview ? upcomingCloses : closePrices, [closePrice]);
    if (trailEntry !== null) yVals.push(trailEntry);
    if (trailClose !== null) yVals.push(trailClose);
    const ft = fillsTrace(startIdx, idx, x0, x1);
    yVals = yVals.concat((ft.y as number[]).map(Number));
    yVals = yVals.filter((v) => isFinite(v) && v > 0);
    const yMin = yVals.length ? Math.min(...yVals) * 0.995 : 0;
    const yMax = yVals.length ? Math.max(...yVals) * 1.005 : 1;
    const mstate = movieFrameState(frame, closePrice);
    const annotationParts: string[] = [t('v7explore.frameAnnotation', { frame: idx + 1 }), t('v7explore.priceAnnotation', { price: fmt(closePrice, 8) })];
    if (isFinite(mstate.balance)) annotationParts.push('Wallet Balance: ' + fmtFixed(mstate.balance, 2));
    if (mstate.walletExposure !== null && isFinite(mstate.walletExposure)) annotationParts.push('WE: ' + fmt(mstate.walletExposure, 6));
    if (isFinite(mstate.posSize)) annotationParts.push('posSize: ' + fmt(mstate.posSize, 8));
    if (mstate.posPrice !== null && isFinite(mstate.posPrice) && mstate.posPrice > 0) annotationParts.push('posPrice: ' + fmt(mstate.posPrice, 8));
    const annotation: PlotlyTrace = { x: 1.02, y: 1, xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'top', text: annotationParts.join('<br>'), showarrow: false, align: 'left', bgcolor: 'rgba(0,0,0,0.5)', font: { size: 13, color: '#e9e5ee' } };
    return {
      name: String(idx),
      data: [traceEntries, traceCloses, currentTrace, traceTrailEntry, traceTrailClose, ft],
      traces: [3, 4, 5, 6, 7, 8],
      layout: { xaxis: { range: [x0, x1] }, yaxis: { range: [yMin, yMax] }, annotations: [annotation] },
    };
  }

  const plotFrames = frames.map((f, idx) => dynamicFrame(f, idx));
  const activeFrame = Math.max(0, Math.min(plotFrames.length - 1, Number(initialFrameIdx === undefined ? movieCurrentFrame : initialFrameIdx) || 0));
  const init = plotFrames[activeFrame] || plotFrames[0] || dynamicFrame(frames[0]!, 0);
  const initData = [traceCandles, traceEmaHigh, traceEmaLow].concat(init.data || []);
  const playFrameNames = plotFrames.slice(activeFrame).map((frame) => frame.name);
  const layout: PlotlyLayout & { xaxis: Record<string, unknown> } = {
    title: t('v7explore.animationTitle', { coin: deepGet<string>(data, ['metadata', 'coin'], ''), frames: frames.length }),
    paper_bgcolor: '#1d1a23',
    plot_bgcolor: '#1d1a23',
    font: { color: '#e9e5ee' },
    height: 760,
    hovermode: 'closest',
    hoverdistance: 50,
    margin: { l: 55, r: 260, t: 60, b: 150 },
    xaxis: { type: 'date', gridcolor: '#3a3545', rangeslider: { visible: false }, autorange: false, range: deepGet<[string, string]>(init, ['layout', 'xaxis', 'range'], [String(xs[0]), String(xs[0])]) },
    yaxis: { title: t('v7explore.price'), gridcolor: '#3a3545', autorange: false, range: deepGet<[number, number]>(init, ['layout', 'yaxis', 'range'], [0, 1]) },
    legend: { x: 1.02, y: 0.85, xanchor: 'left', yanchor: 'top', bgcolor: 'rgba(0,0,0,0.5)' },
    annotations: deepGet<PlotlyTrace[]>(init, ['layout', 'annotations'], []),
    updatemenus: [
      {
        type: 'buttons',
        direction: 'left',
        showactive: false,
        x: 0.01,
        y: -0.06,
        xanchor: 'left',
        yanchor: 'top',
        pad: { r: 10, t: 10 },
        buttons: [
          { label: 'Play', method: 'animate', args: [playFrameNames, { frame: { duration: 120, redraw: false }, fromcurrent: true, mode: 'immediate', transition: { duration: 0, easing: 'linear' } }] },
          { label: 'Slow', method: 'animate', args: [playFrameNames, { frame: { duration: 240, redraw: false }, fromcurrent: true, mode: 'immediate', transition: { duration: 0, easing: 'linear' } }] },
          { label: 'Very Slow', method: 'animate', args: [playFrameNames, { frame: { duration: 480, redraw: false }, fromcurrent: true, mode: 'immediate', transition: { duration: 0, easing: 'linear' } }] },
          { label: 'Pause', method: 'animate', args: [[null], { frame: { duration: 0, redraw: false }, mode: 'immediate', transition: { duration: 0 } }] },
        ],
      },
    ],
    sliders: [
      {
        active: activeFrame,
        steps: plotFrames.map((_, k) => ({
          method: 'animate',
          args: [[String(k)], { mode: 'immediate', frame: { duration: 0, redraw: false }, transition: { duration: 0 } }],
          label: String(k),
        })),
        transition: { duration: 0 },
        x: 0.01,
        y: -0.15,
        currentvalue: { font: { size: 12 }, prefix: t('v7explore.framePrefix'), visible: true, xanchor: 'left' },
        len: 0.99,
        pad: { b: 10, t: 10 },
      },
    ],
  };
  delete layout.xaxis.autorange;
  return { data: initData, layout, frames: plotFrames, activeFrame };
}
