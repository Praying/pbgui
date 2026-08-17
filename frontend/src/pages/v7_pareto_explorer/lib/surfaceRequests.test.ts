import { describe, expect, it } from 'vitest';
import { commandCenterRequestBody, configDetailRequestBody, playgroundRequestBody } from './surfaceRequests';

/*
 * Golden request bodies for the three M-v7-6 surfaces — /command-center
 * (:4038-4044), /config-detail (:4091-4101) and /playground (:3406-3427).
 */

const base = {
  resultPath: '/opt/results/run1',
  loadStrategy: ['performance', 'robustness'],
  maxConfigs: 2000,
  allResultsLoaded: true,
  viewRange: { start: 0, end: 500, max: 1200 },
  pendingViewRange: { start: 0, end: 700, max: 1200 },
};

describe('commandCenterRequestBody (:4038-4044)', () => {
  it('sends the context + pending-over-applied view range', () => {
    expect(commandCenterRequestBody(base)).toEqual({
      result_path: '/opt/results/run1',
      load_strategy: ['performance', 'robustness'],
      max_configs: 2000,
      all_results_loaded: true,
      view_range: { start: 0, end: 700, max: 1200 },
    });
  });

  it('nulls the view range in fast mode', () => {
    expect(commandCenterRequestBody({ ...base, allResultsLoaded: false }).view_range).toBeNull();
    expect(commandCenterRequestBody({ ...base, pendingViewRange: null }).view_range).toEqual({ start: 0, end: 500, max: 1200 });
  });

  it('passes the caller-provided max_configs through unchanged (the cleared-input fallback lives in the store — useParetoSession.effectiveMaxConfigs)', () => {
    expect(commandCenterRequestBody({ ...base, maxConfigs: 350 }).max_configs).toBe(350);
  });
});

describe('configDetailRequestBody (:4091-4101)', () => {
  it('sends the index plus the best-match weights', () => {
    expect(
      configDetailRequestBody(base, {
        configIndex: 7,
        perfWeight: 90,
        riskWeight: 40,
        robustWeight: 60,
      })
    ).toEqual({
      result_path: '/opt/results/run1',
      config_index: 7,
      load_strategy: ['performance', 'robustness'],
      max_configs: 2000,
      all_results_loaded: true,
      view_range: { start: 0, end: 700, max: 1200 },
      perf_weight: 90,
      risk_weight: 40,
      robust_weight: 60,
    });
  });
});

describe('playgroundRequestBody (:3406-3427)', () => {
  const playground = {
    perfWeight: 80,
    riskWeight: 60,
    robustWeight: 70,
    showAll: false,
    useWeighted: true,
    useBtc: false,
    vizType: '3D Scatter',
    quickView: 'Custom...',
    colorMetric: 'adg',
    customXMetric: 'adg_w_usd',
    customYMetric: 'sharpe',
    customZMetric: 'cnc',
  };

  it('sends every playground + preview setting', () => {
    const body = playgroundRequestBody(base, playground, {
      followBestMatch: false,
      selectedConfigIndex: 5,
      previewUseWeighted: true,
      previewShowAll: false,
    });
    expect(body).toEqual({
      result_path: '/opt/results/run1',
      load_strategy: ['performance', 'robustness'],
      max_configs: 2000,
      all_results_loaded: true,
      perf_weight: 80,
      risk_weight: 60,
      robust_weight: 70,
      show_all: false,
      use_weighted: true,
      use_btc: false,
      preview_use_weighted: true,
      preview_show_all: false,
      selected_config_index: 5,
      view_range: { start: 0, end: 700, max: 1200 },
      viz_type: '3D Scatter',
      quick_view: 'Custom...',
      color_metric: 'adg',
      custom_x_metric: 'adg_w_usd',
      custom_y_metric: 'sharpe',
      custom_z_metric: 'cnc',
    });
  });

  it('nulls the selection when following the best match (:3419)', () => {
    const body = playgroundRequestBody(base, playground, {
      followBestMatch: true,
      selectedConfigIndex: 5,
      previewUseWeighted: true,
      previewShowAll: false,
    });
    expect(body.selected_config_index).toBeNull();
    expect(body.view_range).toEqual({ start: 0, end: 700, max: 1200 }); // full mode keeps the pending range
  });

  it('nulls the view range in fast mode and falls back to the applied range (:3420)', () => {
    const fast = { ...base, allResultsLoaded: false, pendingViewRange: null };
    expect(playgroundRequestBody(fast, playground, { followBestMatch: false, selectedConfigIndex: null, previewUseWeighted: false, previewShowAll: false }).view_range).toBeNull();
    expect(
      playgroundRequestBody({ ...base, allResultsLoaded: true, pendingViewRange: null }, playground, {
        followBestMatch: false,
        selectedConfigIndex: null,
        previewUseWeighted: false,
        previewShowAll: false,
      }).view_range
    ).toEqual({ start: 0, end: 500, max: 1200 });
  });
});
