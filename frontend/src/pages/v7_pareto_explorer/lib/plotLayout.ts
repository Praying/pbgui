import type { PlotlyLayout } from './plotlyVendor';

/**
 * Pareto chart layouts — ports of darkPlotLayout (:2580-2644), the preview
 * overrides (:2914-2923, :2928-2937) and projectionPlotLayout (:2646-2679).
 * All pure and immutable: the server layout is never mutated.
 */

const DARK_BG = '#0e1117';
const TEXT = '#fafafa';
const GRID = 'rgba(255,255,255,0.12)';
const ZEROLINE = 'rgba(255,255,255,0.18)';
const POLAR_GRID = 'rgba(255,255,255,0.16)';
const POLAR_LINE = 'rgba(255,255,255,0.22)';

function sceneAxis(source: unknown): PlotlyLayout {
  return { backgroundcolor: DARK_BG, gridcolor: GRID, color: TEXT, ...((source as PlotlyLayout) || {}) };
}

function polarAxis(source: unknown): PlotlyLayout {
  return {
    color: TEXT,
    gridcolor: POLAR_GRID,
    linecolor: POLAR_LINE,
    tickfont: { color: TEXT },
    ...((source as PlotlyLayout) || {}),
  };
}

export function darkPlotLayout(layout?: PlotlyLayout | null): PlotlyLayout {
  const base: PlotlyLayout = { ...(layout || {}) };
  base.paper_bgcolor = DARK_BG;
  base.plot_bgcolor = DARK_BG;
  base.font = { color: TEXT, ...((base.font as PlotlyLayout) || {}) };
  base.legend = { font: { color: TEXT }, ...((base.legend as PlotlyLayout) || {}) };
  base.margin = { l: 80, r: 40, t: 60, b: 70, ...((base.margin as PlotlyLayout) || {}) };
  if (Array.isArray(base.annotations)) {
    base.annotations = (base.annotations as PlotlyLayout[]).map((raw) => {
      const annotation = (raw || {}) as PlotlyLayout;
      return { ...annotation, font: { color: TEXT, ...((annotation.font as PlotlyLayout) || {}) } };
    });
  }
  if (base.xaxis) {
    base.xaxis = { color: TEXT, gridcolor: GRID, zerolinecolor: ZEROLINE, ...((base.xaxis as PlotlyLayout) || {}) };
  }
  if (base.yaxis) {
    base.yaxis = { color: TEXT, gridcolor: GRID, zerolinecolor: ZEROLINE, ...((base.yaxis as PlotlyLayout) || {}) };
  }
  if (base.scene) {
    const scene = base.scene as PlotlyLayout;
    base.scene = {
      ...scene,
      bgcolor: DARK_BG,
      xaxis: sceneAxis(scene.xaxis),
      yaxis: sceneAxis(scene.yaxis),
      zaxis: sceneAxis(scene.zaxis),
    };
  }
  if (base.polar) {
    const polar = base.polar as PlotlyLayout;
    base.polar = { ...polar, bgcolor: DARK_BG, radialaxis: polarAxis(polar.radialaxis), angularaxis: polarAxis(polar.angularaxis) };
  }
  if (base.coloraxis && (base.coloraxis as PlotlyLayout).colorbar) {
    const coloraxis = base.coloraxis as PlotlyLayout;
    const colorbar = coloraxis.colorbar as PlotlyLayout;
    base.coloraxis = {
      ...coloraxis,
      colorbar: {
        ...colorbar,
        tickfont: { color: TEXT, ...((colorbar.tickfont as PlotlyLayout) || {}) },
        title: {
          ...((colorbar.title as PlotlyLayout) || {}),
          font: { color: TEXT, ...((((colorbar.title as PlotlyLayout) || {}).font as PlotlyLayout) || {}) },
        },
      },
    };
  }
  return base;
}

/**
 * The preview figure layout — legend above the plot, roomy top margin and a
 * 750 px height floor (:2914-2923 for pareto_analysis, :2928-2937 robustness).
 */
export function previewPlotLayout(layout?: PlotlyLayout | null): PlotlyLayout {
  const base = darkPlotLayout(layout || {});
  base.legend = { ...((base.legend as PlotlyLayout) || {}), orientation: 'h', x: 0, xanchor: 'left', y: 1.14, yanchor: 'bottom' };
  base.margin = { ...((base.margin as PlotlyLayout) || {}), t: 110, r: 40 };
  base.height = Math.max(Number(base.height) || 0, 750);
  return base;
}

/**
 * projectionPlotLayout (:2646-2679) — defined by the legacy page but never
 * called there (verified: no call sites). Retained verbatim for parity so a
 * future projection-title need does not re-derive it.
 */
export function projectionPlotLayout(layout: PlotlyLayout | null | undefined, projectionLabel: string): PlotlyLayout {
  const base = darkPlotLayout(layout || {});
  const annotations = Array.isArray(base.annotations)
    ? (base.annotations as PlotlyLayout[]).filter((annotation) => !annotation || annotation.name !== 'projection-colorbar-title')
    : [];
  base.annotations = annotations;
  base.margin = { ...((base.margin as PlotlyLayout) || {}), l: 70, r: 95, t: 56, b: 64 };
  base.title = { text: String(projectionLabel || '').trim(), x: 0.5, xanchor: 'center', y: 0.98, yanchor: 'top', font: { color: '#9fb3c8', size: 13 } };
  if (base.xaxis && (base.xaxis as PlotlyLayout).title) {
    const xaxis = base.xaxis as PlotlyLayout;
    xaxis.title = { ...((xaxis.title as PlotlyLayout) || {}), standoff: 10 };
  }
  if (base.yaxis && (base.yaxis as PlotlyLayout).title) {
    const yaxis = base.yaxis as PlotlyLayout;
    yaxis.title = { ...((yaxis.title as PlotlyLayout) || {}), standoff: 10 };
  }
  if (base.coloraxis && (base.coloraxis as PlotlyLayout).colorbar) {
    const coloraxis = base.coloraxis as PlotlyLayout;
    const colorbar = coloraxis.colorbar as PlotlyLayout;
    base.coloraxis = {
      ...coloraxis,
      colorbar: { ...colorbar, x: 1.01, thickness: 14, len: 0.78, tickfont: { size: 10, color: TEXT, ...((colorbar.tickfont as PlotlyLayout) || {}) } },
    };
  }
  return base;
}
