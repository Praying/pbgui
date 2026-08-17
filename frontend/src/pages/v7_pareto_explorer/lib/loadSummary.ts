import type { LoadData, ParetoResultInfo } from '../types';

/**
 * Result Context JSON pre payload — port of renderLoadSummary (:2557-2576).
 * Missing server fields fall back to the current page state (:2567-2574).
 */
export interface LoadSummaryFallbacks {
  resultPath: string;
  loadStrategy: string[];
  maxConfigs: number;
}

export interface LoadSummaryJson {
  result:
    | {
        name: string;
        path: string;
        has_all_results: boolean;
        pareto_count: number | null;
        mtime: string | null;
      }
    | { path: string };
  load: {
    mode: string;
    load_strategy: string[];
    max_configs: number;
    view_range: LoadData['view_range'];
    scoring_metrics: string[];
    scenario_labels: string[];
    load_stats: LoadData['load_stats'];
    summary: LoadData['summary'];
  } | null;
}

export function buildLoadSummary(
  load: LoadData | null,
  result: ParetoResultInfo | null,
  fallbacks: LoadSummaryFallbacks
): LoadSummaryJson {
  return {
    // no result → bare path object (:2565)
    result: result
      ? {
          name: result.name || '',
          path: result.path || fallbacks.resultPath || '',
          has_all_results: !!result.has_all_results,
          pareto_count: result.pareto_count == null ? null : result.pareto_count,
          mtime: result.mtime || null,
        }
      : { path: fallbacks.resultPath || '' },
    load: load
      ? {
          mode: load.mode || 'fast',
          load_strategy: load.load_strategy || fallbacks.loadStrategy,
          max_configs: load.max_configs == null ? fallbacks.maxConfigs : load.max_configs,
          view_range: load.view_range || null,
          scoring_metrics: load.scoring_metrics || [],
          scenario_labels: load.scenario_labels || [],
          load_stats: load.load_stats || {},
          summary: load.summary || {},
        }
      : null,
  };
}
