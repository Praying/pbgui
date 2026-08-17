/**
 * bindPlotClick's index extraction (:2781-2824) — pure so the config-detail
 * wiring is testable without Plotly. The DOM half lives in ScatterChart.vue.
 */

export interface PlotlyPoint {
  customdata?: unknown;
  data?: { meta?: unknown; name?: unknown } | null;
  fullData?: { meta?: unknown } | null;
  x?: unknown;
}

function parseConfigIndex(candidate: unknown): number | null {
  const parsed = parseInt(candidate as string, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractFromPoint(point: PlotlyPoint | null | undefined, bestMatchIndex: number | null): number | null {
  if (!point) return null;
  const custom = point.customdata;
  if (Array.isArray(custom) && custom.length) return parseConfigIndex(custom[0]);
  if (custom && typeof custom === 'object' && Object.prototype.hasOwnProperty.call(custom, 'config_index')) {
    return parseConfigIndex((custom as { config_index: unknown }).config_index);
  }
  const data = point.data;
  const meta = data && (data as { meta?: unknown }).meta;
  if (meta && typeof meta === 'object' && Object.prototype.hasOwnProperty.call(meta, 'config_index')) {
    return parseConfigIndex((meta as { config_index: unknown }).config_index);
  }
  const fullMeta = point.fullData && point.fullData.meta;
  if (fullMeta && typeof fullMeta === 'object' && Object.prototype.hasOwnProperty.call(fullMeta, 'config_index')) {
    return parseConfigIndex((fullMeta as { config_index: unknown }).config_index);
  }
  if (typeof data === 'object' && data && typeof data.name === 'string') {
    const match = /Config\s+#?(\d+)/i.exec(data.name);
    if (match && match[1]) return parseConfigIndex(match[1]);
    if (/Best Match/i.test(data.name) && bestMatchIndex != null) return parseConfigIndex(bestMatchIndex);
  }
  if (point.x != null) return parseConfigIndex(point.x);
  return null;
}

/** First point with a usable index wins; the head point is retried last (:2815-2822). */
export function extractPlotConfigIndex(points: PlotlyPoint[], bestMatchIndex: number | null): number | null {
  if (!Array.isArray(points) || !points.length) return null;
  for (const point of points) {
    const index = extractFromPoint(point, bestMatchIndex);
    if (index != null) return index;
  }
  return extractFromPoint(points[0] ?? null, bestMatchIndex);
}

/** bindPlotClick (:2781-2784) — registers the plotly_click handler on a node. */
export function bindPlotClick(
  node: HTMLElement | null,
  handler: (configIndex: number) => void,
  bestMatchIndex: () => number | null
): void {
  if (!node || typeof handler !== 'function') return;
  const dom = node as HTMLElement & { on?: (event: string, handler: (ev: unknown) => void) => void };
  if (typeof dom.on !== 'function') return;
  clearPlotClick(node);
  dom.on('plotly_click', (eventData: unknown) => {
    const data = eventData as { points?: unknown } | null;
    const points = data && Array.isArray(data.points) ? (data.points as PlotlyPoint[]) : [];
    if (!points.length) return;
    const configIndex = extractPlotConfigIndex(points, bestMatchIndex());
    if (configIndex == null) return;
    handler(configIndex);
  });
}

/** clearPlotClickHandlers (:2826-2831). */
export function clearPlotClick(node: HTMLElement | null): void {
  if (!node) return;
  const dom = node as HTMLElement & { removeAllListeners?: (event: string) => void };
  if (typeof dom.removeAllListeners === 'function') dom.removeAllListeners('plotly_click');
}
