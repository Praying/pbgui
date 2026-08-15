/**
 * window.Plotly access — R2: the vendored /app/plotly.min.js stays a script
 * global (loaded by index.html exactly like the legacy page), never bundled.
 * This module is the single typed touch-point, so tests install a fake
 * window.Plotly and components go through getPlotly().
 */
import type { PlotlyLayout, PlotlyTrace } from './plotlyLayouts';

export interface PlotlyVendor {
  react(
    el: HTMLElement,
    traces: PlotlyTrace[],
    layout: PlotlyLayout,
    config: Record<string, unknown>
  ): Promise<unknown>;
  relayout(el: HTMLElement, updates: Record<string, unknown>): Promise<unknown>;
  purge(el: HTMLElement): void;
  Plots: { resize(el: HTMLElement): void };
}

export function getPlotly(): PlotlyVendor | undefined {
  return (window as unknown as { Plotly?: PlotlyVendor }).Plotly;
}
