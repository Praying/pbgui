import type { ViewRange } from '../types';

/**
 * Golden request bodies for the three M-v7-6 surfaces — /command-center
 * (:4038-4044), /config-detail (:4091-4101) and /playground (:3406-3427).
 * Pure state → JSON so payload shapes are testable.
 */

export interface SurfaceRequestSource {
  resultPath: string;
  loadStrategy: string[];
  maxConfigs: number;
  allResultsLoaded: boolean;
  viewRange: ViewRange | null;
  pendingViewRange: ViewRange | null;
}

/** Full mode sends the pending range over the applied one (:4043, :3420). */
function effectiveViewRange(src: SurfaceRequestSource): ViewRange | null {
  return src.allResultsLoaded ? src.pendingViewRange || src.viewRange : null;
}

export function commandCenterRequestBody(src: SurfaceRequestSource): Record<string, unknown> {
  return {
    result_path: src.resultPath,
    load_strategy: src.loadStrategy,
    max_configs: src.maxConfigs,
    all_results_loaded: src.allResultsLoaded,
    view_range: effectiveViewRange(src),
  };
}

export interface ConfigDetailExtras {
  configIndex: number;
  perfWeight: number;
  riskWeight: number;
  robustWeight: number;
}

export function configDetailRequestBody(src: SurfaceRequestSource, extras: ConfigDetailExtras): Record<string, unknown> {
  return {
    ...commandCenterRequestBody(src),
    config_index: extras.configIndex,
    perf_weight: extras.perfWeight,
    risk_weight: extras.riskWeight,
    robust_weight: extras.robustWeight,
  };
}

/** The playground card settings carried by every request (:3411-3426). */
export interface PlaygroundCardSource {
  perfWeight: number;
  riskWeight: number;
  robustWeight: number;
  showAll: boolean;
  useWeighted: boolean;
  useBtc: boolean;
  vizType: string;
  quickView: string;
  colorMetric: string;
  customXMetric: string;
  customYMetric: string;
  customZMetric: string;
}

export interface PlaygroundRequestOptions {
  followBestMatch: boolean;
  selectedConfigIndex: number | null;
  previewUseWeighted: boolean;
  previewShowAll: boolean;
}

export function playgroundRequestBody(src: SurfaceRequestSource, pg: PlaygroundCardSource, opts: PlaygroundRequestOptions): Record<string, unknown> {
  return {
    result_path: src.resultPath,
    load_strategy: src.loadStrategy,
    max_configs: src.maxConfigs,
    all_results_loaded: src.allResultsLoaded,
    perf_weight: pg.perfWeight,
    risk_weight: pg.riskWeight,
    robust_weight: pg.robustWeight,
    show_all: pg.showAll,
    use_weighted: pg.useWeighted,
    use_btc: pg.useBtc,
    preview_use_weighted: opts.previewUseWeighted,
    preview_show_all: opts.previewShowAll,
    selected_config_index: opts.followBestMatch ? null : opts.selectedConfigIndex,
    view_range: effectiveViewRange(src),
    viz_type: pg.vizType,
    quick_view: pg.quickView,
    color_metric: pg.colorMetric,
    custom_x_metric: pg.customXMetric,
    custom_y_metric: pg.customYMetric,
    custom_z_metric: pg.customZMetric,
  };
}
