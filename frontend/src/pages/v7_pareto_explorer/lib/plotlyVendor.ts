/**
 * window.Plotly access — the vendored /static/plotly.min.js stays a script
 * global loaded by index.html exactly like the legacy page (:10), never
 * bundled (recon §2 standing decision). This module is the single typed
 * touch-point (same pattern as v7_strategy_explorer/lib/plotlyVendor.ts).
 */

export type PlotlyTrace = Record<string, unknown>;
export type PlotlyLayout = Record<string, unknown>;
export type PlotlyConfig = Record<string, unknown>;

interface PlotlyDomLike extends HTMLElement {
  on?(event: string, handler: (ev: unknown) => void): void;
  removeListener?(event: string, handler: (ev: unknown) => void): void;
  removeAllListeners?(event: string): void;
  layout?: PlotlyLayout;
  data?: PlotlyTrace[];
}

export interface PlotlyVendor {
  react(el: HTMLElement | string, traces: PlotlyTrace[], layout: PlotlyLayout, config?: PlotlyConfig): Promise<unknown>;
  newPlot(el: HTMLElement | string, traces: PlotlyTrace[], layout: PlotlyLayout, config?: PlotlyConfig): Promise<unknown>;
  relayout(el: HTMLElement | string, updates: PlotlyConfig): Promise<unknown>;
  restyle(el: HTMLElement | string, attr: PlotlyTrace, indices: number[]): Promise<unknown>;
  purge(el: HTMLElement | string): void;
  Plots: { resize(el: HTMLElement): void };
}

export type { PlotlyDomLike };

export function getPlotly(): PlotlyVendor | undefined {
  return (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
}

/** The fullscreen modebar icon (:2681-2685). */
export const PARETO_FULLSCREEN_ICON = {
  width: 500,
  height: 500,
  path: 'M0,100 L0,0 L100,0 L100,25 L25,25 L25,100 Z M400,0 L500,0 L500,100 L425,100 L425,25 L400,25 Z M0,400 L0,500 L100,500 L100,425 L25,425 L25,400 Z M425,400 L500,400 L500,500 L400,500 L400,425 L425,425 Z',
};

/** plotlyConfig() (:2704-2721) — fullscreen toggles the closest .chart-wrap. */
export function paretoPlotlyConfig(title: string): PlotlyConfig {
  return {
    responsive: true,
    displaylogo: false,
    displayModeBar: true,
    modeBarButtonsToAdd: [
      {
        name: 'fullscreen',
        title,
        icon: PARETO_FULLSCREEN_ICON,
        click: (gd: HTMLElement) => {
          const wrap = typeof gd.closest === 'function' ? (gd.closest('.chart-wrap') as HTMLElement | null) : null;
          if (!wrap) return;
          if (!document.fullscreenElement) {
            void wrap.requestFullscreen?.().catch(() => undefined);
          } else {
            void document.exitFullscreen();
          }
        },
      },
    ],
  };
}
