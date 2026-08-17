import { describe, expect, it } from 'vitest';
import { buildLoadRequestBody, type LoadRequestSource } from './loadRequest';

/* The /load POST body (:4625-4660) — the whole playground/deep settings
 * surface rides along every load. */

function makeSource(overrides: Partial<LoadRequestSource> = {}): LoadRequestSource {
  return {
    resultPath: '/opt/results/run1',
    loadStrategy: ['performance', 'coverage'],
    maxConfigs: 1500,
    allResultsLoaded: true,
    persistDefaults: true,
    viewRange: { start: 0, end: 500, max: 1200 },
    pendingViewRange: { start: 100, end: 600, max: 1200 },
    selectedConfigIndex: 3,
    playground: {
      perfWeight: 80,
      riskWeight: 60,
      robustWeight: 70,
      showAll: false,
      useWeighted: true,
      useBtc: false,
      vizType: '2D Scatter',
      quickView: 'Profit vs Risk',
      allowMixedWeighted: false,
      allowMixedCurrency: false,
      customXMetric: 'adg_w_usd',
      customYMetric: 'r_squared',
      customZMetric: '',
      projectionLayout: 'stacked',
      colorMetric: 'None',
      payload: null,
    },
    previewUseWeighted: true,
    previewShowAll: false,
    deepTab: 'evolution',
    deepParametersTopN: 20,
    deepScenariosMetric: 'adg',
    deepEvolutionMetric: 'sharpe',
    deepEvolutionShowAll: true,
    deepEvolutionHideOutliers: true,
    deepEvolutionUseWeighted: false,
    deepEvolutionUseBtc: true,
    deepEvolutionWindowPercent: 5,
    deepEvolutionImprovementThresholdPct: 1,
    deepCorrelationsStrategy: 'Top Performers',
    deepCorrelationsNumConfigs: 5,
    deepCorrelationsUseWeighted: true,
    deepCorrelationsUseBtc: false,
    ...overrides,
  };
}

describe('buildLoadRequestBody (:4625-4660)', () => {
  it('serialises every settings field under its snake_case key', () => {
    const body = buildLoadRequestBody(makeSource());
    expect(body).toEqual({
      result_path: '/opt/results/run1',
      load_strategy: ['performance', 'coverage'],
      max_configs: 1500,
      all_results_loaded: true,
      persist_defaults: true,
      view_range: { start: 100, end: 600, max: 1200 },
      selected_config_index: 3,
      playground_perf_weight: 80,
      playground_risk_weight: 60,
      playground_robust_weight: 70,
      playground_show_all: false,
      playground_use_weighted: true,
      playground_use_btc: false,
      playground_viz_type: '2D Scatter',
      playground_quick_view: 'Profit vs Risk',
      playground_color_metric: 'None',
      playground_custom_x_metric: 'adg_w_usd',
      playground_custom_y_metric: 'r_squared',
      playground_custom_z_metric: '',
      preview_use_weighted: true,
      preview_show_all: false,
      deep_tab: 'evolution',
      deep_parameters_top_n: 20,
      deep_scenarios_metric: 'adg',
      deep_evolution_metric: 'sharpe',
      deep_evolution_show_all: true,
      deep_evolution_hide_outliers: true,
      deep_evolution_use_weighted: false,
      deep_evolution_use_btc: true,
      deep_evolution_window_percent: 5,
      deep_evolution_improvement_threshold_pct: 1,
      deep_correlations_strategy: 'Top Performers',
      deep_correlations_num_configs: 5,
      deep_correlations_use_weighted: true,
      deep_correlations_use_btc: false,
    });
  });

  it('sends view_range null while in fast (pareto-only) mode (:4631)', () => {
    const body = buildLoadRequestBody(makeSource({ allResultsLoaded: false }));
    expect(body.view_range).toBeNull();
  });

  it('prefers the pending view range over the applied one (:4631)', () => {
    const body = buildLoadRequestBody(
      makeSource({ viewRange: { start: 0, end: 100, max: 1200 }, pendingViewRange: null })
    );
    expect(body.view_range).toEqual({ start: 0, end: 100, max: 1200 });
  });

  it('keeps max_configs numeric even when the input came from a form string', () => {
    const body = buildLoadRequestBody(makeSource({ maxConfigs: 2000 }));
    expect(body.max_configs).toBe(2000);
  });
});
