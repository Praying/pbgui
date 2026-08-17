/**
 * Custom-metric plumbing — ports of isWeightedMetricName (:2009-2012),
 * filterCustomMetrics (:2014-2028), setSelectOptions (:2030-2051), the
 * quick-view option sets (:3332-3336), the custom-control visibility matrix
 * (:2064-2073) and preserveCurrentCustomMetrics (:2121-2131).
 */

export function isWeightedMetricName(metric: unknown): boolean {
  const name = String(metric || '');
  return name.indexOf('_w_') >= 0 || /_w_(usd|btc)$/.test(name) || /_w_(?!.*_w_)/.test(name);
}

export interface CustomMetricFilterOptions {
  allowMixedCurrency: boolean;
  useBtc: boolean;
  allowMixedWeighted: boolean;
  useWeighted: boolean;
}

/** The available-metric list filtered to the active currency + weighting (:2014-2028). */
export function filterCustomMetrics(available: unknown, opts: CustomMetricFilterOptions): string[] {
  const source = Array.isArray(available) ? (available as string[]).slice() : [];
  let filtered = source;
  if (!opts.allowMixedCurrency) {
    const currency = opts.useBtc ? '_btc' : '_usd';
    filtered = filtered.filter((metric) => String(metric).endsWith(currency) || (!String(metric).endsWith('_usd') && !String(metric).endsWith('_btc')));
  }
  if (!opts.allowMixedWeighted) {
    filtered = filtered.filter((metric) => (opts.useWeighted ? isWeightedMetricName(metric) : !isWeightedMetricName(metric)));
  }
  return filtered.length ? filtered : source;
}

/**
 * setSelectOptions (:2030-2051): selected + fallback are unshifted when
 * missing; the value resolves selected → fallback → first option → ''.
 */
export function resolveMetricOptions(metrics: string[], selected: string, fallback: string): { options: string[]; value: string } {
  const options = Array.isArray(metrics) ? metrics.slice() : [];
  for (const metric of [selected, fallback]) {
    const normalized = String(metric || '').trim();
    if (!normalized || options.includes(normalized)) continue;
    options.unshift(normalized);
  }
  let value = selected && options.includes(selected) ? selected : '';
  if (!value && fallback && options.includes(fallback)) value = fallback;
  if (!value && options.length) value = options[0]!;
  return { options, value: value || '' };
}

/** The per-visualization quick-view sets (:3332-3336). */
export function quickViewOptionsFor(vizType: string): string[] {
  if (vizType === '2D Scatter') {
    return ['Profit vs Risk', 'Risk-Adjusted', 'Profit vs Quality', 'Efficiency', 'Multi-Risk', 'Profit vs Recovery', 'Performance Ratios', 'Exposure Analysis', 'Custom...'];
  }
  if (vizType === 'Radar Chart') return ['Top Comparison', 'Risk Profile'];
  return ['Risk-Reward Triangle', 'Recovery Performance', 'Trading Efficiency', 'Risk Spectrum', 'Stability Analysis', 'Trading Activity', 'Stress Test', 'Custom...'];
}

export interface CustomControlVisibility {
  isCustom: boolean;
  isRadar: boolean;
  is3d: boolean;
  showCustom: boolean;
  showFilters: boolean;
  showZ: boolean;
}

/** updatePlaygroundCustomUi's visibility half (:2064-2073). */
export function customControlVisibility(quickView: string, vizType: string): CustomControlVisibility {
  const isCustom = quickView === 'Custom...';
  const isRadar = vizType === 'Radar Chart';
  const is3d = vizType === '3D Scatter' || vizType === '3D Projections';
  const showCustom = isCustom && !isRadar;
  return { isCustom, isRadar, is3d, showCustom, showFilters: showCustom, showZ: isCustom && is3d };
}

/** preserveCurrentCustomMetrics (:2121-2131) — entering Custom keeps the payload axes. */
export function preservedCustomMetrics(
  metrics: { x_metric?: string; y_metric?: string; z_metric?: string } | null | undefined,
  vizType: string
): { x?: string; y?: string; z: string } {
  const out: { x?: string; y?: string; z: string } = { z: '' };
  if (!metrics) return out;
  if (metrics.x_metric) out.x = String(metrics.x_metric);
  if (metrics.y_metric) out.y = String(metrics.y_metric);
  out.z = vizType === '3D Scatter' || vizType === '3D Projections' ? (metrics.z_metric ? String(metrics.z_metric) : '') : '';
  return out;
}
