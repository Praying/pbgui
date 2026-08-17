import type { LoadData, RawViewRange, Translate, ViewRange } from '../types';

/**
 * Display-range math — ports of normalizeViewRange (:1986-2001) and
 * currentRangeMax (:2003-2007). Pure: the full-mode flag comes in as an
 * argument instead of reading page state.
 */

/**
 * Clamp a candidate range into [0, total]; null when full mode is off or the
 * total is unusable. Defaults to the first min(500, max) configs.
 */
export function normalizeViewRange(range: RawViewRange | ViewRange | null, totalConfigs: number | null, allResultsLoaded: boolean): ViewRange | null {
  if (totalConfigs == null || totalConfigs <= 0 || !allResultsLoaded) return null;
  const max = Math.max(0, Math.trunc(Number(totalConfigs)) || 0);
  const defaultEnd = Math.min(500, max);
  let start = 0;
  let end = defaultEnd;
  if (range && typeof range === 'object') {
    start = Math.trunc(Number(range.start ?? 0)) as number;
    end = Math.trunc(Number(range.end ?? defaultEnd)) as number;
  }
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = defaultEnd;
  start = Math.max(0, Math.min(start, max));
  end = Math.max(start, Math.min(end, max));
  return { start, end, max };
}

/** Total visible-range ceiling: view_range.max, else load_stats.selected_configs, else 0. */
export function currentRangeMax(load: LoadData | null): number {
  if (load && load.view_range && load.view_range.max != null) return Math.trunc(Number(load.view_range.max)) || 0;
  if (load && load.load_stats && load.load_stats.selected_configs != null) {
    return Math.trunc(Number(load.load_stats.selected_configs)) || 0;
  }
  return 0;
}

/**
 * The "Loading X of Y" range summary (:2163-2173, M-v7-5 handoff 3): the
 * animated percent maps to a loaded end rank, capped at the target end and
 * floored at the range start.
 */
export function buildDisplayRangeLoadingSummary(display: number, range: ViewRange, total: number, t: Translate): string {
  const loadedEnd = Math.min(range.end, Math.max(range.start, Math.round((display / 100) * total)));
  const loadedVisible = Math.max(0, loadedEnd - range.start);
  const targetVisible = Math.max(0, range.end - range.start);
  return t('v7explore.loadingDisplayRange', {
    loaded: loadedVisible,
    target: targetVisible,
    start: range.start + 1,
    end: range.end,
  });
}
