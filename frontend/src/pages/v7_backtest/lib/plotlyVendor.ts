/**
 * window.Plotly access — the vendored /app/plotly.min.js stays a script
 * global loaded by index.html exactly like the legacy page (:8), never
 * bundled. This module is the single typed touch-point (same pattern as
 * the pareto/strategy/dashboard vendored globals, R2/R5).
 */

export type PlotlyTrace = Record<string, unknown>;
export type PlotlyLayout = Record<string, unknown>;
export type PlotlyConfig = Record<string, unknown>;

export interface PlotlyVendor {
  newPlot(el: HTMLElement | string, traces: PlotlyTrace[], layout: PlotlyLayout, config?: PlotlyConfig): Promise<unknown>;
  react(el: HTMLElement | string, traces: PlotlyTrace[], layout: PlotlyLayout, config?: PlotlyConfig): Promise<unknown>;
  relayout(el: HTMLElement | string, updates: PlotlyConfig): Promise<unknown>;
  restyle(el: HTMLElement | string, attr: PlotlyTrace, indices: number[]): Promise<unknown>;
  purge(el: HTMLElement | string): void;
  Plots: { resize(el: HTMLElement): void };
}

export function getPlotly(): PlotlyVendor | undefined {
  return (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
}

/** Fullscreen modebar icon (:6432-6434). */
export const FULLSCREEN_ICON = {
  width: 500,
  height: 500,
  path: 'M0,100 L0,0 L100,0 L100,25 L25,25 L25,100 Z M400,0 L500,0 L500,100 L425,100 L425,25 L400,25 Z M0,400 L0,500 L100,500 L100,425 L25,425 L25,400 Z M425,400 L500,400 L500,500 L400,500 L400,425 L425,425 Z',
};

interface ModebarButton {
  name: string;
  title: string;
  icon: { width: number; height: number; path: string };
  click(gd: HTMLElement): void;
}

/** _plotlyConf (:6436-6450) — responsive + the chart-wrap fullscreen button. */
export function plotlyFullscreenConfig(toggleFullscreenTitle: string): PlotlyConfig {
  return {
    responsive: true,
    displaylogo: false,
    modeBarButtonsToAdd: [
      {
        name: 'fullscreen',
        title: toggleFullscreenTitle,
        icon: FULLSCREEN_ICON,
        click: (gd: HTMLElement) => {
          const wrap = gd.closest('.chart-wrap') as HTMLElement | null;
          if (!wrap) return;
          if (!document.fullscreenElement) void wrap.requestFullscreen?.().catch(() => undefined);
          else void document.exitFullscreen();
        },
      } satisfies ModebarButton,
    ],
  };
}
