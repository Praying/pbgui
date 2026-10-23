import type { PlotlyLayout } from './plotlyVendor';
import { currentTheme, themeColors } from '@/shared/lib/themeColors';

/**
 * Pareto chart layouts — ports of darkPlotLayout (:2580-2644) and the preview
 * overrides (:2914-2923, :2928-2937). All pure and immutable: the server
 * layout is never mutated.
 *
 * The legacy projectionPlotLayout (:2646-2679) was defined but never called
 * there and is not consumed by the Vue page either — dropped rather than
 * ported as dead code.
 */

/* Dark literals are the legacy values and stay byte-for-byte what they were
   (plotLayout.test.ts pins them). Under [data-theme='light'] the same names
   resolve to the light ink instead — white-on-white gridlines would vanish. */
const DARK = {
  bg: '#10141d',
  text: '#e8ecf4',
  grid: 'rgba(255,255,255,0.12)',
  sceneGrid: 'rgba(255,255,255,0.12)',
  zeroline: 'rgba(255,255,255,0.18)',
  polarGrid: 'rgba(255,255,255,0.16)',
  polarLine: 'rgba(255,255,255,0.22)',
} as const;

type Palette = { bg: string; text: string; grid: string; sceneGrid: string; zeroline: string; polarGrid: string; polarLine: string };

function palette(): Palette {
  if (currentTheme() !== 'light') return DARK;
  const c = themeColors();
  const ink = (a: number) => `rgba(15,31,39,${a})`;
  /* 2D grids stay faint (0.12): they sit behind data on a clean plane. The 3D
     scene box and polar rings are the chart's only frame, and on a near-white
     surface a 12% ink wash disappears entirely (verified by rendering the real
     WebGL scene at 0.12 / 0.35 / 0.6). They need a firmer ink than white-on-dark
     ever did, because light-on-dark has far more luminance headroom. */
  return { bg: c.surface, text: c.text, grid: ink(0.12), sceneGrid: ink(0.45), zeroline: ink(0.2), polarGrid: ink(0.4), polarLine: ink(0.55) };
}

function sceneAxis(source: unknown): PlotlyLayout {
  const P = palette();
  return { backgroundcolor: P.bg, gridcolor: P.sceneGrid, color: P.text, ...((source as PlotlyLayout) || {}) };
}

function polarAxis(source: unknown): PlotlyLayout {
  const P = palette();
  return {
    color: P.text,
    gridcolor: P.polarGrid,
    linecolor: P.polarLine,
    tickfont: { color: P.text },
    ...((source as PlotlyLayout) || {}),
  };
}

export function darkPlotLayout(layout?: PlotlyLayout | null): PlotlyLayout {
  const P = palette();
  const base: PlotlyLayout = { ...(layout || {}) };
  base.paper_bgcolor = P.bg;
  base.plot_bgcolor = P.bg;
  base.font = { color: P.text, ...((base.font as PlotlyLayout) || {}) };
  base.legend = { font: { color: P.text }, ...((base.legend as PlotlyLayout) || {}) };
  base.margin = { l: 80, r: 40, t: 60, b: 70, ...((base.margin as PlotlyLayout) || {}) };
  if (Array.isArray(base.annotations)) {
    base.annotations = (base.annotations as PlotlyLayout[]).map((raw) => {
      const annotation = (raw || {}) as PlotlyLayout;
      return { ...annotation, font: { color: P.text, ...((annotation.font as PlotlyLayout) || {}) } };
    });
  }
  if (base.xaxis) {
    base.xaxis = { color: P.text, gridcolor: P.grid, zerolinecolor: P.zeroline, ...((base.xaxis as PlotlyLayout) || {}) };
  }
  if (base.yaxis) {
    base.yaxis = { color: P.text, gridcolor: P.grid, zerolinecolor: P.zeroline, ...((base.yaxis as PlotlyLayout) || {}) };
  }
  if (base.scene) {
    const scene = base.scene as PlotlyLayout;
    base.scene = {
      ...scene,
      bgcolor: P.bg,
      xaxis: sceneAxis(scene.xaxis),
      yaxis: sceneAxis(scene.yaxis),
      zaxis: sceneAxis(scene.zaxis),
    };
  }
  if (base.polar) {
    const polar = base.polar as PlotlyLayout;
    base.polar = { ...polar, bgcolor: P.bg, radialaxis: polarAxis(polar.radialaxis), angularaxis: polarAxis(polar.angularaxis) };
  }
  if (base.coloraxis && (base.coloraxis as PlotlyLayout).colorbar) {
    const coloraxis = base.coloraxis as PlotlyLayout;
    const colorbar = coloraxis.colorbar as PlotlyLayout;
    base.coloraxis = {
      ...coloraxis,
      colorbar: {
        ...colorbar,
        tickfont: { color: P.text, ...((colorbar.tickfont as PlotlyLayout) || {}) },
        title: {
          ...((colorbar.title as PlotlyLayout) || {}),
          font: { color: P.text, ...((((colorbar.title as PlotlyLayout) || {}).font as PlotlyLayout) || {}) },
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
