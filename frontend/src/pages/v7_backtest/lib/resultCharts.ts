import {
  buildExposure,
  drawdownSeries,
  hardStopEma,
  hardStopLookbackDays,
  hardStopSideConfig,
  hardStopTriggerIndices,
  resolveFillsTimes,
  resultDisplayName,
  rollingDrawdown,
} from './resultsModel';
import { plotlyFullscreenConfig, type PlotlyConfig, type PlotlyLayout, type PlotlyTrace } from './plotlyVendor';
import type { BacktestResultItem, BacktestVersion, BeSeries, ParsedCsv, PricePayload } from '../types';

/**
 * The results chart *specs* — pure trace/layout factories for the legacy
 * Plotly calls: _chartLayout (:7212-7224), renderBEChart (:6968-7025),
 * renderPnlChart (:7243-7282), renderTWEChart (:7374-7513),
 * renderHardStopDrawdownChart (:7127-7204), the compare trace builder
 * (:7626-7634) and _plotlyConf (:6436-6450). Plotly itself is touched
 * only through the PlotlyDiv wrapper.
 */

/** chartWrap's section title: name + result time (:6974-6976). */
export function chartTitle(result: BacktestResultItem, t: (iso: string) => string): string {
  return `${resultDisplayName(result)} ${t(result.modified ?? '')}`;
}

/**
 * Morandi dark-theme chart constants — mirror the tokens.css palette as
 * literals because Plotly resolves colors directly (no CSS var support).
 */
export const CHART_BG = '#16141a'; // var(--bg-page)
export const CHART_TEXT = '#e9e5ee'; // var(--text-primary)
export const CHART_GRID = '#3a3545'; // var(--border-default)

/** _chartLayout (:7212-7224). */
export function chartLayout(title: string, yTitle: string): PlotlyLayout {
  return {
    paper_bgcolor: CHART_BG,
    plot_bgcolor: CHART_BG,
    font: { color: CHART_TEXT, size: 12, family: 'Source Sans Pro, sans-serif' },
    margin: { l: 60, r: 20, t: 40, b: 40 },
    title: { text: title, x: 0.5, font: { size: 14 } },
    xaxis: { gridcolor: CHART_GRID, griddash: 'dot', showgrid: true },
    yaxis: { gridcolor: CHART_GRID, title: yTitle },
    legend: { orientation: 'h', y: 1.05 },
    hovermode: 'x unified',
    height: 800,
  };
}

export { plotlyFullscreenConfig };

/** The TWE layout tweak that drops the title below the legend (:7508-7512). */
export function tweLayout(title: string): PlotlyLayout {
  const layout = chartLayout(title, 'Exposure');
  layout.margin = { ...(layout.margin as Record<string, number>), t: 80 };
  layout.title = { ...(layout.title as Record<string, unknown>), y: 0.97, yanchor: 'top' };
  layout.legend = { orientation: 'h', y: 1.0, yanchor: 'bottom' };
  return layout;
}

/* ── Balance & Equity (:6990-7023) ──────────────────────────────────── */

/** renderBEChart's traces (:6999-7002). */
export function beChartTraces(be: BeSeries, options: { isBtc: boolean }): PlotlyTrace[] {
  const balance = options.isBtc ? be.balance_btc : be.balance;
  const equity = options.isBtc ? be.equity_btc : be.equity;
  return [
    { x: be.time, y: equity, name: options.isBtc ? 'equity_btc' : 'equity', line: { width: 0.75 } },
    { x: be.time, y: balance, name: options.isBtc ? 'balance_btc' : 'balance', line: { width: 2.5 } },
  ];
}

/** renderBEChart's drawdown traces (:6990). */
export function drawdownTraces(be: BeSeries, options: { isBtc: boolean }): PlotlyTrace[] {
  const equity = options.isBtc ? be.equity_btc : be.equity;
  return [{ x: be.time, y: drawdownSeries(equity), name: 'Drawdown', line: { width: 1.5 }, showlegend: true }];
}

/** The close-price overlay trace (:7005-7013). */
export function priceOverlayTrace(price: PricePayload): PlotlyTrace {
  return {
    x: price.time ?? [],
    y: price.close ?? [],
    name: `${price.exchange ?? ''} / ${price.coin ?? ''} close`,
    mode: 'lines',
    yaxis: 'y2',
    line: { color: 'rgba(164, 147, 196, 0.7)', width: 1.25, dash: 'dot' }, // morandi purple (#a493c4 @ 0.7)
    hovertemplate: '%{y:.8g}<extra>Coin price</extra>',
  };
}

/** The overlay's right-axis layout (:7014-7021). */
export function applyPriceOverlay(layout: PlotlyLayout, price: PricePayload): PlotlyLayout {
  return {
    ...layout,
    margin: { ...(layout.margin as Record<string, number>), r: 80 },
    yaxis2: {
      title: `${price.coin ?? ''} Price`,
      overlaying: 'y',
      side: 'right',
      showgrid: false,
      zeroline: false,
    },
  };
}

/* ── PnL per symbol (:7243-7282) ────────────────────────────────────── */

/** renderPnlChart's cumulative pnl+fee traces per coin. */
export function pnlTraces(csv: ParsedCsv, result: BacktestResultItem): PlotlyTrace[] {
  const rows = csv.rows;
  if (!rows.length) return [];
  const headers = csv.headers.map((header) => header.trim());
  const coinCol = headers.includes('coin') ? 'coin' : 'symbol';
  const pnlCol = 'pnl';
  const feeCol = headers.includes('fee_paid') ? 'fee_paid' : null;
  const times = resolveFillsTimes(rows, headers, result);

  const coins: Record<string, { times: (string | number)[]; pnl: number[]; cumPnl: number }> = {};
  rows.forEach((row, i) => {
    const coin = row[coinCol] || 'unknown';
    if (!coins[coin]) coins[coin] = { times: [], pnl: [], cumPnl: 0 };
    const entry = coins[coin]!;
    entry.cumPnl += (Number.parseFloat(row[pnlCol] ?? '') || 0) + (feeCol ? Number.parseFloat(row[feeCol] ?? '') || 0 : 0);
    entry.times.push(times[i]!);
    entry.pnl.push(entry.cumPnl);
  });

  return Object.keys(coins).map((coin) => ({
    x: coins[coin]!.times,
    y: coins[coin]!.pnl,
    name: coin,
    mode: 'lines',
  }));
}

/* ── TWE (:7390-7503) ───────────────────────────────────────────────── */

/** renderTWEChart's WE rows → long/short fills (:7395-7410). */
function exposureFills(csv: ParsedCsv, result: BacktestResultItem): { long: Array<{ time: string | number; coin: string; we: number }>; short: Array<{ time: string | number; coin: string; we: number }> } {
  const rows = csv.rows;
  const headers = csv.headers.map((header) => header.trim());
  const coinCol = headers.includes('coin') ? 'coin' : 'symbol';
  const balCol = headers.includes('balance') ? 'balance' : 'usd_total_balance';
  const hasType = headers.includes('type');
  const times = resolveFillsTimes(rows, headers, result);
  const long: Array<{ time: string | number; coin: string; we: number }> = [];
  const short: Array<{ time: string | number; coin: string; we: number }> = [];
  rows.forEach((row, i) => {
    const bal = Number.parseFloat(row[balCol] ?? '') || 0;
    if (bal === 0) return;
    const psize = Number.parseFloat(row.psize ?? '') || 0;
    const pprice = Number.parseFloat(row.pprice ?? '') || 0;
    const we = (1 / bal) * psize * pprice;
    const coin = row[coinCol] || 'unknown';
    const type = hasType ? row.type ?? '' : '';
    if (type.includes('short')) short.push({ time: times[i]!, coin, we });
    else long.push({ time: times[i]!, coin, we });
  });
  return { long, short };
}

/** renderTWEChart's traces (:7484-7503) — the caller supplies the resolution. */
export function tweTraces(csv: ParsedCsv, resolutionMinutes: number, result: BacktestResultItem): PlotlyTrace[] {
  if (!csv.rows.length) return [];
  const { long, short } = exposureFills(csv, result);
  const longExposure = buildExposure(long, resolutionMinutes);
  const shortExposure = buildExposure(short, resolutionMinutes);

  const traces: PlotlyTrace[] = [];
  if (longExposure.twe.length) {
    traces.push({ x: longExposure.times, y: longExposure.twe, name: 'Long TWE', line: { width: 2.5 } });
  }
  if (shortExposure.twe.length) {
    traces.push({ x: shortExposure.times, y: shortExposure.twe, name: 'Short TWE', line: { width: 2.5 } });
  }
  for (const coin of Object.keys(longExposure.coins)) {
    traces.push({ x: longExposure.times, y: longExposure.coins[coin], name: `${coin} Long WE`, line: { width: 0.75 }, visible: 'legendonly' });
  }
  for (const coin of Object.keys(shortExposure.coins)) {
    traces.push({ x: shortExposure.times, y: shortExposure.coins[coin], name: `${coin} Short WE`, line: { width: 0.75 }, visible: 'legendonly' });
  }
  return traces;
}

/* ── Compare (:7626-7634) ───────────────────────────────────────────── */

/** Morandi categorical series palette: accent / success / warning / danger
 *  bases + purple + soft variants (mirrors tokens.css). */
export const COMPARE_COLORS = [
  '#8ba7c2', // accent
  '#8fb593', // success
  '#c4a67e', // warning
  '#c58e8a', // danger
  '#a493c4', // purple
  '#a9c0d6', // accent-soft
  '#accbab', // success-soft
  '#daadaa', // danger-soft
] as const;

export interface CompareItem {
  path: string;
  version: BacktestVersion;
  be: BeSeries;
}

/** compareSelected's eq/bal trace pairs, one color per result. */
export function compareTraces(items: readonly CompareItem[], options?: { plainLabel?: boolean }): PlotlyTrace[] {
  const traces: PlotlyTrace[] = [];
  items.forEach((item, i) => {
    if (!item.be.time.length) return;
    const tail = item.path.split('/').slice(-3).join('/');
    // compareSelectedArchive labels with the PB version (:7819); the legacy
    // panel renders the plain path tail (:7854)
    const label = options?.plainLabel ? tail : `PB${item.version.toUpperCase()} ${tail}`;
    const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
    traces.push({ x: item.be.time, y: item.be.equity, name: `eq ${label}`, line: { width: 0.75, color } });
    traces.push({ x: item.be.time, y: item.be.balance, name: `bal ${label}`, line: { width: 2.5, color, dash: 'dot' } });
  });
  return traces;
}

/* ── Equity hard stop (:7127-7204) ──────────────────────────────────── */

export interface HardStopChartSpec {
  traces: PlotlyTrace[];
  layout: PlotlyLayout;
  emptyReason: string | null;
}

/** renderHardStopDrawdownChart (:7127-7204) — the empty reasons are the legacy literals. */
export function hardStopChartSpec(version: BacktestVersion, be: BeSeries, config: unknown): HardStopChartSpec {
  const sideConfigs = (['long', 'short'] as const)
    .map((side) => hardStopSideConfig(version, config, side))
    .filter((cfg): cfg is NonNullable<typeof cfg> => cfg !== null);
  if (!sideConfigs.length) {
    return { traces: [], layout: {}, emptyReason: 'Equity hard stop is not enabled for this result' };
  }

  const points: Array<{ time: string; ts: number; equity: number }> = [];
  for (let i = 0; i < be.time.length; i++) {
    const ts = new Date(be.time[i]!).getTime();
    const eq = Number.parseFloat(String(be.equity[i] ?? ''));
    if (Number.isFinite(ts) && Number.isFinite(eq)) points.push({ time: be.time[i]!, ts, equity: eq });
  }
  if (!points.length) {
    return { traces: [], layout: {}, emptyReason: 'No equity data found for hard-stop drawdown' };
  }

  const times = points.map((point) => point.time);
  const timesMs = points.map((point) => point.ts);
  const equity = points.map((point) => point.equity);
  const lookbackDays = hardStopLookbackDays(config);
  const raw = rollingDrawdown(timesMs, equity, lookbackDays);

  const traces: PlotlyTrace[] = [];
  const layout: PlotlyLayout = {
    paper_bgcolor: CHART_BG,
    plot_bgcolor: CHART_BG,
    font: { color: CHART_TEXT, size: 12, family: 'Source Sans Pro, sans-serif' },
    margin: { l: 70, r: 30, t: 70, b: 50 },
    title: {
      text:
        sideConfigs.length > 1
          ? 'Equity Hard Stop Drawdown'
          : `${sideConfigs[0]!.side.charAt(0).toUpperCase() + sideConfigs[0]!.side.slice(1)} Equity Hard Stop Drawdown`,
      x: 0.5,
      font: { size: 15 },
    },
    xaxis: { gridcolor: CHART_GRID, griddash: 'dot', showgrid: true, anchor: 'y' },
    legend: { orientation: 'h', x: 0, y: 1.1 },
    hovermode: 'x unified',
    height: sideConfigs.length > 1 ? 1100 : 800,
  };
  const domains =
    sideConfigs.length > 1
      ? [
          { draw: [0.78, 1.0], prox: [0.56, 0.72] },
          { draw: [0.28, 0.50], prox: [0.0, 0.22] },
        ]
      : [{ draw: [0.30, 1.0], prox: [0.0, 0.22] }];
  // Morandi series colors (tokens.css literals): long = accent/warning/
  // success/success-soft; short = purple/warning-deep/danger-soft/accent-deep.
  const colors: Record<string, { raw: string; ema: string; score: string; prox: string }> = {
    long: { raw: '#8ba7c2', ema: '#c4a67e', score: '#8fb593', prox: '#accbab' },
    short: { raw: '#a493c4', ema: '#8a6d46', score: '#daadaa', prox: '#56748f' },
  };
  const thresholdColors = { yellow: '#dbc4a2', orange: '#c4a67e', red: '#c58e8a' };

  sideConfigs.forEach((cfg, sideIdx) => {
    const axisNum = sideIdx * 2 + 1;
    const proxAxisNum = axisNum + 1;
    const yAxisName = axisNum === 1 ? 'y' : `y${axisNum}`;
    const proxAxisName = `y${proxAxisNum}`;
    const yLayoutName = axisNum === 1 ? 'yaxis' : `yaxis${axisNum}`;
    const proxLayoutName = `yaxis${proxAxisNum}`;
    const dom = domains[sideIdx]!;
    const prefix = sideConfigs.length > 1 ? cfg.side.charAt(0).toUpperCase() + cfg.side.slice(1) + ' ' : '';

    const ema = hardStopEma(timesMs, raw, cfg.emaSpan);
    const score = raw.map((value, i) => Math.min(value, ema[i] ?? 0));
    const proximity = score.map((value) => (cfg.redThreshold > 0 ? (value / cfg.redThreshold) * 100 : 0));
    const redTriggerIdx = hardStopTriggerIndices(score, cfg.redThreshold);
    const redTriggerTimes = redTriggerIdx.map((i) => times[i]!);
    const redTriggerText = redTriggerIdx.map((i) =>
      `${cfg.side.toUpperCase()} RED trigger<br>${times[i] ?? ''}<br>Score: ${score[i]!.toFixed(6)}<br>RED: ${cfg.redThreshold.toFixed(6)}<br>% of RED: ${proximity[i]!.toFixed(1)}%`
    );

    layout[yLayoutName] = { domain: dom.draw, gridcolor: CHART_GRID, griddash: 'dot', title: `${prefix}Drawdown` };
    layout[proxLayoutName] = { domain: dom.prox, gridcolor: CHART_GRID, griddash: 'dot', title: '% of RED', anchor: 'x' };

    traces.push({ x: times, y: raw, name: `${prefix}Raw Drawdown`, mode: 'lines', yaxis: yAxisName, line: { color: colors[cfg.side]!.raw, width: 1 }, opacity: 0.45 });
    traces.push({ x: times, y: ema, name: `${prefix}EMA Drawdown`, mode: 'lines', yaxis: yAxisName, line: { color: colors[cfg.side]!.ema, width: 1 }, opacity: 0.75 });
    traces.push({ x: times, y: score, name: `${prefix}Trigger Score`, mode: 'lines', yaxis: yAxisName, line: { color: colors[cfg.side]!.score, width: 1.5, dash: 'dash' } });
    traces.push({ x: [times[0], times[times.length - 1]], y: [cfg.yellowThreshold, cfg.yellowThreshold], name: `${prefix}Yellow Threshold`, mode: 'lines', yaxis: yAxisName, line: { color: thresholdColors.yellow, width: 1, dash: 'dot' }, opacity: 0.8 });
    traces.push({ x: [times[0], times[times.length - 1]], y: [cfg.orangeThreshold, cfg.orangeThreshold], name: `${prefix}Orange Threshold`, mode: 'lines', yaxis: yAxisName, line: { color: thresholdColors.orange, width: 1, dash: 'dot' }, opacity: 0.8 });
    traces.push({ x: [times[0], times[times.length - 1]], y: [cfg.redThreshold, cfg.redThreshold], name: `${prefix}RED Threshold`, mode: 'lines', yaxis: yAxisName, line: { color: thresholdColors.red, width: 1.2, dash: 'dash' }, opacity: 0.85 });
    traces.push({ x: times, y: proximity, name: `${prefix}RED Proximity`, mode: 'lines', yaxis: proxAxisName, line: { color: colors[cfg.side]!.prox, width: 1.1 }, fill: 'tozeroy', fillcolor: 'rgba(172, 203, 171, 0.14)' }); // success-soft @ 0.14
    traces.push({ x: [times[0], times[times.length - 1]], y: [100, 100], name: `${prefix}RED Hit`, mode: 'lines', yaxis: proxAxisName, line: { color: thresholdColors.red, width: 1.2, dash: 'dash' } });
    if (redTriggerIdx.length) {
      traces.push({
        x: redTriggerTimes,
        y: redTriggerIdx.map((i) => score[i]!),
        text: redTriggerText,
        name: `${prefix}RED Trigger (${redTriggerIdx.length})`,
        mode: 'markers',
        yaxis: yAxisName,
        marker: { color: thresholdColors.red, size: 9, symbol: 'diamond', line: { color: '#ffffff', width: 1 } },
        hovertemplate: '%{text}<extra></extra>',
      });
      traces.push({
        x: redTriggerTimes,
        y: redTriggerIdx.map((i) => proximity[i]!),
        text: redTriggerText,
        name: `${prefix}RED Trigger %`,
        mode: 'markers',
        yaxis: proxAxisName,
        marker: { color: thresholdColors.red, size: 8, symbol: 'triangle-up', line: { color: '#ffffff', width: 1 } },
        hovertemplate: '%{text}<extra></extra>',
        showlegend: false,
      });
    }
  });

  return { traces, layout, emptyReason: null };
}

/** The BE chart's empty-data notice (:6969-6971). */
export function beEmptyMessage(): string {
  return 'No balance and equity data found';
}

/** The fullscreen config bound to the page's i18n title (:6436-6450). */
export function resultPlotlyConfig(toggleFullscreenTitle: string): PlotlyConfig {
  return plotlyFullscreenConfig(toggleFullscreenTitle);
}
