import type { PlotlyLayout, PlotlyVendor } from '../lib/plotlyVendor';

/**
 * Pareto chart plumbing — the react-vs-newPlot decision (:2313, R5),
 * rememberChartHeight (:2689-2702), the fullscreen relayout (:2723-2779) and
 * fitChartToWrap (:2750-2766). M-v7-7's deep-intelligence plots reuse
 * renderStablePlot's decision through choosePlotRenderer.
 */

type ChartDom = HTMLElement & { data?: unknown; layout?: PlotlyLayout };

/** renderStableDeepPlot's existence probe (:2295). */
export function plotHasExistingPlot(node: HTMLElement): boolean {
  const dom = node as ChartDom;
  return !!((dom.data && dom.layout) || node.querySelector('.plot-container'));
}

/** :2313 — react only reuses an existing plot AND Plotly.react exists. */
export function choosePlotRenderer(node: HTMLElement, plotly: PlotlyVendor | undefined): 'react' | 'newPlot' {
  return plotHasExistingPlot(node) && typeof plotly?.react === 'function' ? 'react' : 'newPlot';
}

/** rememberChartHeight (:2689-2702) — returns the remembered height (0 = none). */
export function rememberChartHeight(node: HTMLElement): number {
  if (!node) return 0;
  let height = 0;
  try {
    height = Math.trunc(Number((node as ChartDom).layout?.height) || 0) || 0;
  } catch {
    height = 0;
  }
  if (!height && node.offsetHeight) height = Math.trunc(node.offsetHeight) || 0;
  if (!height) return 0;
  const wrap = typeof node.closest === 'function' ? (node.closest('.chart-wrap') as HTMLElement | null) : null;
  if (!wrap || !wrap.dataset) return height;
  wrap.dataset.restoreHeight = String(height);
  wrap.style.height = height + 'px';
  node.style.height = height + 'px';
  return height;
}

/** relayoutFullscreenChart's update payload (:2735-2737) — pure. */
export function fullscreenRelayoutUpdate(isFullscreen: boolean, restoreHeight: number): Record<string, unknown> {
  return isFullscreen
    ? { autosize: true, width: null, height: null }
    : { autosize: true, width: null, height: restoreHeight || null };
}

/** fitChartToWrap's update payload (:2759) — pure. */
export function fitRelayoutUpdate(wrapHeight: number): Record<string, unknown> {
  return { autosize: true, width: null, height: wrapHeight || null };
}

/** relayoutFullscreenChart (:2723-2748). */
export function relayoutFullscreenChart(plotly: PlotlyVendor, wrap: HTMLElement): void {
  if (!wrap || !wrap.classList || !wrap.classList.contains('chart-wrap')) return;
  const chartNode =
    (wrap.querySelector('[id^="preview-"]') as HTMLElement | null) || (wrap.querySelector('[id^="playground-chart"]') as HTMLElement | null);
  if (!chartNode || !plotly) return;
  const restoreHeight = Math.trunc(Number((wrap.dataset && wrap.dataset.restoreHeight) || 0)) || 0;
  if (document.fullscreenElement === wrap) {
    wrap.style.height = '';
    chartNode.style.height = '';
  } else if (restoreHeight) {
    wrap.style.height = restoreHeight + 'px';
    chartNode.style.height = restoreHeight + 'px';
  }
  const relayoutUpdate = fullscreenRelayoutUpdate(document.fullscreenElement === wrap, restoreHeight);
  setTimeout(() => {
    try {
      void plotly.relayout(chartNode, relayoutUpdate);
      if (plotly.Plots && typeof plotly.Plots.resize === 'function') plotly.Plots.resize(chartNode);
    } catch {
      // legacy swallows relayout failures (:2746)
    }
  }, 50);
}

/** fitChartToWrap (:2750-2766) — height-only relayout, never a re-plot. */
export function fitChartToWrap(plotly: PlotlyVendor, node: HTMLElement): void {
  if (!node || !plotly) return;
  const wrap = typeof node.closest === 'function' ? (node.closest('.chart-wrap') as HTMLElement | null) : null;
  if (!wrap) return;
  const wrapHeight = Math.trunc(Number(wrap.clientHeight || wrap.offsetHeight || 0) || 0) || 0;
  if (wrapHeight) node.style.height = wrapHeight + 'px';
  setTimeout(() => {
    try {
      void plotly.relayout(node, fitRelayoutUpdate(wrapHeight));
      if (plotly.Plots && typeof plotly.Plots.resize === 'function') plotly.Plots.resize(node);
    } catch {
      // legacy swallows relayout failures (:2764)
    }
  }, 0);
}

/**
 * The document fullscreenchange listener (:2768-2779): tracks the active
 * chart wrap and relayouts it on enter AND exit.
 */
export function useFullscreenRelayout(plotlyGetter: () => PlotlyVendor | undefined): { install(): void; dispose(): void } {
  let activeWrap: HTMLElement | null = null;
  function handler(): void {
    const wrap = document.fullscreenElement as HTMLElement | null;
    if (wrap && wrap.classList && wrap.classList.contains('chart-wrap')) {
      activeWrap = wrap;
      const plotly = plotlyGetter();
      if (plotly) relayoutFullscreenChart(plotly, wrap);
      return;
    }
    if (activeWrap) {
      const plotly = plotlyGetter();
      if (plotly) relayoutFullscreenChart(plotly, activeWrap);
      activeWrap = null;
    }
  }
  return {
    install() {
      document.addEventListener('fullscreenchange', handler);
    },
    dispose() {
      document.removeEventListener('fullscreenchange', handler);
      activeWrap = null;
    },
  };
}
