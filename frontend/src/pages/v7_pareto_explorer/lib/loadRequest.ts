import type { PlaygroundSettings, ViewRange } from '../types';

/**
 * The /load POST body (:4625-4660) — every playground/preview/deep setting
 * rides along each load. Pure state → JSON so the payload shape is testable.
 */
export interface LoadRequestSource {
  resultPath: string;
  loadStrategy: string[];
  maxConfigs: number;
  allResultsLoaded: boolean;
  persistDefaults: boolean;
  viewRange: ViewRange | null;
  pendingViewRange: ViewRange | null;
  selectedConfigIndex: number | null;
  playground: PlaygroundSettings;
  previewUseWeighted: boolean;
  previewShowAll: boolean;
  deepTab: string;
  deepParametersTopN: number;
  deepScenariosMetric: string;
  deepEvolutionMetric: string;
  deepEvolutionShowAll: boolean;
  deepEvolutionHideOutliers: boolean;
  deepEvolutionUseWeighted: boolean;
  deepEvolutionUseBtc: boolean;
  deepEvolutionWindowPercent: number;
  deepEvolutionImprovementThresholdPct: number;
  deepCorrelationsStrategy: string;
  deepCorrelationsNumConfigs: number;
  deepCorrelationsUseWeighted: boolean;
  deepCorrelationsUseBtc: boolean;
}

export function buildLoadRequestBody(src: LoadRequestSource): Record<string, unknown> {
  const pg = src.playground;
  return {
    result_path: src.resultPath,
    load_strategy: src.loadStrategy,
    max_configs: src.maxConfigs,
    all_results_loaded: src.allResultsLoaded,
    persist_defaults: src.persistDefaults,
    // full mode only; pending wins over applied (:4631)
    view_range: src.allResultsLoaded ? src.pendingViewRange || src.viewRange : null,
    selected_config_index: src.selectedConfigIndex,
    playground_perf_weight: pg.perfWeight,
    playground_risk_weight: pg.riskWeight,
    playground_robust_weight: pg.robustWeight,
    playground_show_all: pg.showAll,
    playground_use_weighted: pg.useWeighted,
    playground_use_btc: pg.useBtc,
    playground_viz_type: pg.vizType,
    playground_quick_view: pg.quickView,
    playground_color_metric: pg.colorMetric,
    playground_custom_x_metric: pg.customXMetric,
    playground_custom_y_metric: pg.customYMetric,
    playground_custom_z_metric: pg.customZMetric,
    preview_use_weighted: src.previewUseWeighted,
    preview_show_all: src.previewShowAll,
    deep_tab: src.deepTab,
    deep_parameters_top_n: src.deepParametersTopN,
    deep_scenarios_metric: src.deepScenariosMetric,
    deep_evolution_metric: src.deepEvolutionMetric,
    deep_evolution_show_all: src.deepEvolutionShowAll,
    deep_evolution_hide_outliers: src.deepEvolutionHideOutliers,
    deep_evolution_use_weighted: src.deepEvolutionUseWeighted,
    deep_evolution_use_btc: src.deepEvolutionUseBtc,
    deep_evolution_window_percent: src.deepEvolutionWindowPercent,
    deep_evolution_improvement_threshold_pct: src.deepEvolutionImprovementThresholdPct,
    deep_correlations_strategy: src.deepCorrelationsStrategy,
    deep_correlations_num_configs: src.deepCorrelationsNumConfigs,
    deep_correlations_use_weighted: src.deepCorrelationsUseWeighted,
    deep_correlations_use_btc: src.deepCorrelationsUseBtc,
  };
}
