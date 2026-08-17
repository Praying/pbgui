/**
 * window.Plotly access — the vendored /static/plotly.min.js stays a script
 * global loaded by index.html exactly like the legacy page (:9), never
 * bundled. This module is the single typed touch-point (same pattern as
 * dashboard_editor/lib/plotlyVendor.ts).
 */

export type PlotlyTrace = Record<string, unknown>;
export type PlotlyLayout = Record<string, unknown>;
export type PlotlyConfig = Record<string, unknown>;

export interface PlotlyFrame {
  name: string;
  data: PlotlyTrace[];
  traces?: number[];
  layout?: PlotlyLayout;
}

interface PlotlyDomLike extends HTMLElement {
  on?(event: string, handler: (ev: unknown) => void): void;
  removeListener?(event: string, handler: (ev: unknown) => void): void;
  _pbguiCandleRelayout?: (ev: unknown) => void;
  layout?: PlotlyLayout;
}

export interface PlotlyVendor {
  react(el: HTMLElement | string, traces: PlotlyTrace[], layout: PlotlyLayout, config?: PlotlyConfig): Promise<unknown>;
  newPlot(el: HTMLElement | string, traces: PlotlyTrace[], layout: PlotlyLayout, config?: PlotlyConfig): Promise<unknown>;
  addFrames(el: HTMLElement | string, frames: PlotlyFrame[]): Promise<unknown>;
  animate(el: HTMLElement | string, frameNames: string | string[], opts: PlotlyConfig): Promise<unknown>;
  restyle(el: HTMLElement | string, attr: PlotlyTrace, indices: number[]): Promise<unknown>;
  relayout(el: HTMLElement | string, updates: PlotlyConfig): Promise<unknown>;
  purge(el: HTMLElement | string): void;
  Plots: { resize(el: HTMLElement): void };
}

export function getPlotly(): PlotlyVendor | undefined {
  return (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
}

export function plotEl(id: string): PlotlyDomLike | null {
  return document.getElementById(id) as PlotlyDomLike | null;
}

/** Fullscreen modebar icon (:2426). */
export const MOVIE_FULLSCREEN_ICON = {
  width: 500,
  height: 500,
  path: 'M0,100 L0,0 L100,0 L100,25 L25,25 L25,100 Z M400,0 L500,0 L500,100 L425,100 L425,25 L400,25 Z M0,400 L0,500 L100,500 L100,425 L25,425 L25,400 Z M425,400 L500,400 L500,500 L400,500 L400,425 L425,425 Z',
};

/** Modebar config with the custom fullscreen button (:2427-2429). */
export function plotlyFullscreenConfig(target: string): PlotlyConfig {
  return {
    responsive: true,
    displaylogo: false,
    displayModeBar: true,
    modeBarButtonsToAdd: [
      {
        name: 'fullscreen',
        title: 'Toggle Fullscreen',
        icon: MOVIE_FULLSCREEN_ICON,
        click: (gd: HTMLElement) => {
          const el = document.getElementById(target) || gd;
          if (!document.fullscreenElement) {
            void el.requestFullscreen?.().catch(() => undefined);
          } else {
            void document.exitFullscreen();
          }
        },
      },
    ],
  };
}
