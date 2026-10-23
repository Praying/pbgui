import { themedPlotLayout } from './plotTheme';

/**
 * Wrap the vendored `window.Plotly` so every figure is themed on its way in.
 *
 * Pages reach Plotly through a per-page `getPlotly()`; returning this facade
 * from there themes `newPlot` / `react` layouts without touching any of the
 * ~15 figure call sites. All other members (relayout, restyle, purge, Plots,
 * addFrames, animate …) pass straight through.
 *
 * `relayout` updates are deliberately not rewritten: they are partial,
 * user-driven (zoom, axis type) and never carry the chrome colours.
 *
 * In the dark theme `themedPlotLayout` returns the same object, so dark
 * figures are exactly what they were.
 */
type AnyFn = (...args: never[]) => unknown;

export function withTheme<T extends object>(plotly: T | undefined): T | undefined {
  if (!plotly) return plotly;
  return new Proxy(plotly, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if ((prop === 'newPlot' || prop === 'react') && typeof value === 'function') {
        return (el: unknown, traces: unknown, layout: unknown, config?: unknown) =>
          (value as AnyFn).call(target, ...([el, traces, themedPlotLayout(layout as Record<string, unknown>), config] as never[]));
      }
      return typeof value === 'function' ? (value as AnyFn).bind(target) : value;
    },
  });
}
