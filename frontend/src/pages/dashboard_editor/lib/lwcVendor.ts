/**
 * window.LightweightCharts access — R2: the vendored
 * /app/vendor/lightweight-charts.standalone.production.js stays a script
 * global (loaded by index.html exactly like the legacy page,
 * dashboard_editor.html:13), never bundled. This module is the single typed
 * touch-point mirroring lib/plotlyVendor.ts; tests install a fake
 * window.LightweightCharts and the controller goes through
 * getLightweightCharts().
 */

/** A raw OHLCV row in seconds + the volume histogram bar. */
export interface LwCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LwVolume {
  time: number;
  value: number;
  color: string;
}

export interface LwPriceLine {
  applyOptions(options: Record<string, unknown>): void;
}

export interface LwSeries {
  setData(data: Array<LwCandle | LwVolume>): void;
  update(bar: LwCandle | LwVolume): void;
  applyOptions(options: Record<string, unknown>): void;
  createPriceLine(options: Record<string, unknown>): LwPriceLine;
  removePriceLine(line: LwPriceLine): void;
}

export interface LwTimeScale {
  fitContent(): void;
  subscribeVisibleLogicalRangeChange(
    handler: (range: { from: number; to: number } | null) => void
  ): void;
  unsubscribeVisibleLogicalRangeChange(
    handler: (range: { from: number; to: number } | null) => void
  ): void;
}

export interface LwChart {
  applyOptions(options: Record<string, unknown>): void;
  priceScale(id: string): { applyOptions(options: Record<string, unknown>): void };
  timeScale(): LwTimeScale;
  remove(): void;
  /** v3 API (render.js:3347). */
  addCandlestickSeries?(options: Record<string, unknown>): LwSeries;
  /** v3 API (render.js:3423). */
  addHistogramSeries?(options: Record<string, unknown>): LwSeries;
  /** v4+ API (render.js:3349, 3425). */
  addSeries?(definition: unknown, options: Record<string, unknown>): LwSeries;
}

export interface LightweightChartsVendor {
  createChart(container: HTMLElement, options: Record<string, unknown>): LwChart;
  CrosshairMode: { Normal: number };
  LineStyle: { Solid: number; Dotted: number; Dashed: number };
  /** v4+ series definitions (render.js:3349, 3425). */
  CandlestickSeries?: unknown;
  HistogramSeries?: unknown;
}

export function getLightweightCharts(): LightweightChartsVendor | undefined {
  return (window as unknown as { LightweightCharts?: LightweightChartsVendor }).LightweightCharts;
}
