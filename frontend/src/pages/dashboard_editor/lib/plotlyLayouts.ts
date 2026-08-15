/**
 * Plotly trace/layout factories — the dedup of the four near-identical
 * legacy renderers (renderTop 600-659, renderPnl 1593-1668, renderAdg
 * 3866-3933, renderPpl 1873-1951 in dashboard_render.js):
 *
 *  - TOP: bar chart of symbols × income (no zoom preservation — legacy
 *    buildTop's fast path passes no savedZoom);
 *  - PNL/ADG: identical bar/line charts (income vs adg field, ADG appends %
 *    to the hover label) — one shared layout factory;
 *  - P+L: two-series profits/losses with the computed y-range padding and the
 *    fractional zoom remap for sum-period switches (dashboard_ppl.html
 *    `_getFracZoom` + render.js:1901-1913).
 *
 * Every factory returns NEW objects (immutability): the zoom applicators
 * build shallow copies instead of mutating the base layout the way the
 * legacy code did (`layout.xaxis.range = …`).
 *
 * dashT resolves through the page translator (lib/i18n.ts); in unit tests it
 * degrades to the English fallback literals — the legacy `_t` fallback path.
 */
import { dashT } from './i18n';
import type { SavedZoom } from './savedZoom';
import type { IncomeTrace, TopRow } from '../types/widgets';

/* ── vendor shapes (window.Plotly stays a global, R2) ── */

export type PlotlyTrace = Record<string, unknown>;
export type PlotlyLayout = Record<string, unknown>;
export type AxisLayout = Record<string, unknown>;

/** The subset of a Plotly graphDiv the capture helpers read (gd.layout). */
export interface GdLike {
  layout?: {
    xaxis?: { autorange?: boolean; range?: unknown };
    yaxis?: { autorange?: boolean; range?: unknown };
  };
  data?: Array<{ x?: unknown }>;
}

/* ── shared pieces ── */

const PAPER_BG = '#0e1117';
const AXIS_GRID = '#2d3748';
const AXIS_TEXT = '#e2e8f0';
const POS_COLOR = '#68d391';
const NEG_COLOR = '#fc8181';
const LINE_COLOR = '#63b3ed';

function baseLayout(xaxis: AxisLayout, marginBottom: number): PlotlyLayout {
  return {
    paper_bgcolor: PAPER_BG,
    plot_bgcolor: PAPER_BG,
    font: { color: AXIS_TEXT, size: 11 },
    margin: { l: 50, r: 20, t: 40, b: marginBottom },
    xaxis,
    yaxis: {
      gridcolor: AXIS_GRID,
      color: AXIS_TEXT,
      zeroline: true,
      zerolinecolor: '#4a5568',
    },
    bargap: 0.3,
    autosize: true,
    transition: { duration: 0, easing: 'linear' },
  };
}

function withHeight(layout: PlotlyLayout, height: number | null | undefined): PlotlyLayout {
  return height ? { ...layout, height } : layout;
}

function signColors(values: number[]): string[] {
  return values.map((v) => (v < 0 ? NEG_COLOR : POS_COLOR));
}

/* ── TOP (render.js:600-618, 659) ── */

export function topTraces(rows: TopRow[]): PlotlyTrace[] {
  const symbols = rows.map((r) => r[1]);
  const incomes = rows.map((r) => parseFloat(String(r[2])));
  const colors = signColors(incomes);
  return [
    {
      x: symbols,
      y: incomes,
      type: 'bar',
      marker: { color: colors },
      hovertemplate:
        '<b>%{x}</b><br>' + dashT('dash.income', 'Income') + ': %{y:.4f}<extra></extra>',
    },
  ];
}

export function topLayout(height: number | null): PlotlyLayout {
  return withHeight(
    baseLayout({ tickangle: -45, gridcolor: AXIS_GRID, color: AXIS_TEXT }, 60),
    height
  );
}

/* ── PNL / ADG (render.js:1593-1668 / 3866-3933) ── */

export type DatedBar = { date: string; [key: string]: unknown };

function modeTraces(
  bars: DatedBar[],
  mode: string,
  valueKey: string,
  hoverLabel: string
): PlotlyTrace[] {
  const dates = bars.map((b) => b.date);
  const values = bars.map((b) => Number(b[valueKey]));
  const colors = signColors(values);

  if (mode === 'line') {
    return [
      {
        x: dates,
        y: values,
        type: 'scatter',
        mode: 'lines+markers',
        line: { color: LINE_COLOR, width: 1 },
        marker: { color: colors, size: 6 },
        hovertemplate: `<b>%{x}</b><br>${hoverLabel}: %{y:.2f}<extra></extra>`,
      },
    ];
  }
  return [
    {
      x: dates,
      y: values,
      type: 'bar',
      marker: { color: colors },
      text: values.map((v) => v.toFixed(2)),
      textposition: 'auto',
      hovertemplate: `<b>%{x}</b><br>${hoverLabel}: %{y:.2f}<extra></extra>`,
    },
  ];
}

export function pnlTraces(bars: DatedBar[], mode: string): PlotlyTrace[] {
  return modeTraces(bars, mode, 'income', dashT('dash.income', 'Income'));
}

export function adgTraces(bars: DatedBar[], mode: string): PlotlyTrace[] {
  /* legacy keeps the ADG hover label literal and appends % after the value */
  return modeTraces(bars, mode, 'adg', 'ADG').map((trace) => ({
    ...trace,
    hovertemplate: `<b>%{x}</b><br>ADG: %{y:.2f}%<extra></extra>`,
  }));
}

/** PNL and ADG share the identical layout (render.js:1644-1656 = 3896-3908). */
export function pnlLayout(height: number | null): PlotlyLayout {
  return withHeight(
    baseLayout({ tickangle: -45, gridcolor: AXIS_GRID, color: AXIS_TEXT, type: 'date' }, 50),
    height
  );
}

/* ── P+L (render.js:1873-1951) ── */

export interface PplBar {
  period: string;
  profits: number;
  losses: number;
}

export function pplTraces(bars: PplBar[]): PlotlyTrace[] {
  const periods = bars.map((b) => b.period);
  const profits = bars.map((b) => b.profits);
  const losses = bars.map((b) => b.losses);
  const nameProfits = dashT('dash.profits', 'Profits');
  const nameLosses = dashT('dash.losses', 'Losses');
  const textOf = (values: number[]): string[] => values.map((v) => (v === 0 ? '' : v.toFixed(2)));

  return [
    {
      x: periods,
      y: profits,
      type: 'bar',
      name: nameProfits,
      marker: { color: '#48bb78' },
      text: textOf(profits),
      textposition: 'outside',
      hovertemplate: `<b>%{x}</b><br>${nameProfits}: %{y:.2f}<extra></extra>`,
    },
    {
      x: periods,
      y: losses,
      type: 'bar',
      name: nameLosses,
      marker: { color: '#f56565' },
      text: textOf(losses),
      textposition: 'outside',
      hovertemplate: `<b>%{x}</b><br>${nameLosses}: %{y:.2f}<extra></extra>`,
    },
  ];
}

/** y-range with 10% padding; the legacy yRange=0 guard (render.js:1903-1911). */
export function pplLayout(height: number | null, bars: PplBar[]): PlotlyLayout {
  const allVals = bars.flatMap((b) => [b.profits, b.losses]);
  let yaxis: AxisLayout = {
    gridcolor: AXIS_GRID,
    color: AXIS_TEXT,
    zeroline: true,
    zerolinecolor: '#4a5568',
  };
  if (allVals.length > 0) {
    const yMin = Math.min(...allVals);
    const yMax = Math.max(...allVals);
    const yRange = yMax - yMin;
    const padding =
      yRange > 0 ? yRange * 0.1 : Math.max(Math.abs(yMin), Math.abs(yMax)) * 0.2 || 1;
    yaxis = { ...yaxis, range: [yMin - padding, yMax + padding] };
  }
  return withHeight(
    {
      ...baseLayout(
        { tickangle: -45, gridcolor: AXIS_GRID, color: AXIS_TEXT, type: 'category', nticks: 20 },
        50
      ),
      barmode: 'relative',
      yaxis,
      legend: { font: { color: AXIS_TEXT } },
    },
    height
  );
}

/* ── INCOME (render.js:866-893 fast path + 1500-1524 _buildIncomeChart) ── */

/**
 * Per-symbol cumulative line traces (render.js:866-868 fast path = 1501-1510
 * initial build): scatter/lines/showlegend, name from the server.
 */
export function incomeTraces(traces: IncomeTrace[]): PlotlyTrace[] {
  return traces.map((t) => ({
    x: t.x,
    y: t.y,
    name: t.name,
    type: 'scatter',
    mode: 'lines',
    showlegend: true,
  }));
}

/**
 * The income layout (render.js:869-877 fast path = 1513-1524 initial): unlike
 * the PNL/ADG skeleton it uses margins l55/r15/t40/b40, a plain xaxis (no
 * tickangle/type) and a transparent legend — kept as its own factory instead
 * of baseLayout so the parity stays byte-exact. The height key is only added
 * when provided (legacy `if (origHeight) layout.height = origHeight`).
 */
export function incomeLayout(height: number | null): PlotlyLayout {
  const layout: PlotlyLayout = {
    paper_bgcolor: PAPER_BG,
    plot_bgcolor: PAPER_BG,
    font: { color: AXIS_TEXT, size: 11 },
    margin: { l: 55, r: 15, t: 40, b: 40 },
    autosize: true,
    xaxis: { gridcolor: AXIS_GRID, color: AXIS_TEXT },
    yaxis: { gridcolor: AXIS_GRID, color: AXIS_TEXT, zeroline: true, zerolinecolor: '#4a5568' },
    legend: { bgcolor: 'rgba(0,0,0,0)', font: { size: 10, color: AXIS_TEXT } },
    transition: { duration: 0, easing: 'linear' },
  };
  return withHeight(layout, height);
}

/* ── zoom restore (render.js:1630-1637, 1901-1923, 3907-3913) ── */

function xaxisWithRange(layout: PlotlyLayout, range: [number, number]): PlotlyLayout {
  return {
    ...layout,
    xaxis: { ...(layout.xaxis as AxisLayout), range: [...range], autorange: false },
  };
}

function yaxisWithRange(layout: PlotlyLayout, range: [number, number]): PlotlyLayout {
  return {
    ...layout,
    yaxis: { ...(layout.yaxis as AxisLayout), range: [...range], autorange: false },
  };
}

/** PNL/ADG + the PPL plain branch: apply x/y ranges, autorange false. */
export function applyRangeZoom(layout: PlotlyLayout, zoom: SavedZoom | null): PlotlyLayout {
  if (!zoom) return layout;
  let out = layout;
  if (zoom.xrange) out = xaxisWithRange(out, zoom.xrange);
  if (zoom.yrange) out = yaxisWithRange(out, zoom.yrange);
  return out;
}

/**
 * PPL zoom: a one-shot fractional range (captured before a sum-period
 * switch) is proportionally remapped onto the new bar count; otherwise the
 * plain x/y ranges apply. The y-range is deliberately not restored in the
 * frac branch — the aggregation level changes the value scale (legacy
 * comment, render.js:1912).
 */
export function applyPplZoom(layout: PlotlyLayout, zoom: SavedZoom | null, barCount: number): PlotlyLayout {
  if (zoom && zoom.fracRange && barCount > 0) {
    const m = barCount;
    const newLo = zoom.fracRange[0] * m;
    const newHi = zoom.fracRange[1] * m;
    if (newHi > newLo && newHi > 0 && newLo < m) {
      return xaxisWithRange(layout, [
        Math.max(-0.5, newLo),
        Math.min(m - 0.5, newHi),
      ]);
    }
    return layout;
  }
  return applyRangeZoom(layout, zoom);
}

/* ── zoom capture from a graphDiv ── */

export interface CapturedZoom {
  xrange: [number, number] | null;
  yrange: [number, number] | null;
}

/** Fast-path capture (render.js:1698-1705): sliced ranges when autorange off. */
export function captureZoom(gd: GdLike): CapturedZoom {
  const xa = gd.layout?.xaxis;
  const ya = gd.layout?.yaxis;
  const xr = xa && xa.autorange === false && Array.isArray(xa.range) ? [...xa.range] : [];
  const yr = ya && ya.autorange === false && Array.isArray(ya.range) ? [...ya.range] : [];
  return {
    xrange: xr.length === 2 ? ([xr[0] as number, xr[1] as number] as [number, number]) : null,
    yrange: yr.length === 2 ? ([yr[0] as number, yr[1] as number] as [number, number]) : null,
  };
}

/** One-shot fractional capture (dashboard_ppl.html:105-117 `_getFracZoom`). */
export function captureFracZoom(
  gd: GdLike
): { fracRange: [number, number]; yrange: [number, number] | null } | null {
  const base = captureZoom(gd);
  if (!base.xrange) return null;
  const data = gd.data ?? [];
  const first = data.length > 0 ? data[0] : undefined;
  const xs = first && Array.isArray(first.x) ? first.x : [];
  const n = xs.length;
  if (n < 2) return null;
  return { fracRange: [base.xrange[0] / n, base.xrange[1] / n], yrange: base.yrange };
}

/* ── shared Plotly config (render.js:653-684) ── */

export const FULLSCREEN_BUTTON_PATH =
  'M0 0v285.7h142.9V142.9H285.7V0H0zm571.4 0v142.9h142.9v142.9H857.1V0H571.4zM0 571.4v285.7h285.7V714.3H142.9V571.4H0zm714.3 142.9v142.9H571.4v142.9H857.1V571.4H714.3z';

export function plotlyConfig(options: {
  displayModeBar: boolean;
  responsive: boolean;
  onToggleFullscreen: (gd: unknown) => void;
}): Record<string, unknown> {
  return {
    displayModeBar: options.displayModeBar,
    responsive: options.responsive,
    modeBarButtonsToAdd: [
      {
        name: 'fullscreen',
        title: dashT('dash.fullscreen', 'Fullscreen'),
        icon: { width: 857.1, height: 857.1, path: FULLSCREEN_BUTTON_PATH },
        click: options.onToggleFullscreen,
      },
    ],
  };
}
