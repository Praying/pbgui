/**
 * Pareto Explorer data shapes — ports of the server payloads consumed by
 * frontend/v7_pareto_explorer.html (api/pareto_explorer.py responses).
 * All fields optional/unknown-safe: the server is an external system.
 */

export type OptimizeVersion = 'v7' | 'v8';

export type ParetoStage = 'command_center' | 'pareto_playground' | 'deep_intelligence' | 'settings';

export type DeepTab = 'parameters' | 'scenarios' | 'evolution' | 'correlations';

export interface ViewRange {
  start: number;
  end: number;
  max: number;
}

export interface PageMessage {
  level: string;
  text: string;
}

export interface ParetoResultInfo {
  name?: string;
  path?: string;
  /** Per-result generation — the runtime flavor source (:1767). */
  optimize_version?: string;
  pareto_count?: number | null;
  has_all_results?: boolean;
  mtime?: string | null;
}

export interface LoadStats {
  selected_configs?: number;
  total_parsed?: number;
  pareto_configs?: number;
  scan_cache?: string;
}

export interface LoadSummaryStats {
  visible_configs?: number;
  selected_configs?: number;
  scanned_configs?: number;
  pareto_configs?: number;
}

export interface RawViewRange {
  start?: number | null;
  end?: number | null;
  max?: number | null;
}

export interface LoadData {
  mode?: string;
  /** Result descriptor echoed by /load (applyLoadData :4521-4523). */
  result?: ParetoResultInfo | null;
  view_range?: RawViewRange | null;
  load_stats?: LoadStats;
  summary?: LoadSummaryStats;
  scoring_metrics?: string[];
  scenario_labels?: string[];
  load_strategy?: string[];
  max_configs?: number;
  cache_hit?: boolean;
  status?: string;
  job?: { job_id?: string; progress?: number; message?: string; error?: string } | null;
  messages?: PageMessage[];
  refresh_bundle?: RefreshBundle | null;
}

export interface LoadDefaults {
  stage?: string;
  deep_tab?: string;
  all_results_loaded?: boolean;
  load_strategy?: string[];
  max_configs?: number;
  preview_show_all?: boolean;
  show_timings?: boolean;
}

export interface ParetoSession {
  result?: ParetoResultInfo | null;
  result_valid?: boolean;
  result_path?: string;
  /** Session-level generation when the result dir carries none (:1766). */
  optimize_version?: string;
  load?: LoadData | null;
  defaults?: LoadDefaults | null;
  messages?: PageMessage[];
}

export interface RefreshBundle {
  command_center?: unknown | null;
  selected_config_index?: number | null;
  detail?: unknown | null;
  playground?: unknown | null;
  deep_intelligence?: { tab?: string; payload?: unknown } | null;
}

/** Pinned strategy-compare baseline (:4242-4247) — v8 runtime only. */
export interface StrategyCompareBaseline {
  result_path: string;
  config_index: number;
  config: Record<string, unknown>;
  override_configs: Record<string, unknown>;
}

/** Playground card settings (:1700-1717 defaults). */
export interface PlaygroundSettings {
  perfWeight: number;
  riskWeight: number;
  robustWeight: number;
  showAll: boolean;
  useWeighted: boolean;
  useBtc: boolean;
  vizType: string;
  quickView: string;
  allowMixedWeighted: boolean;
  allowMixedCurrency: boolean;
  customXMetric: string;
  customYMetric: string;
  customZMetric: string;
  projectionLayout: string;
  colorMetric: string;
  payload: unknown | null;
}

/** Load-progress job status response (:2520-2555). */
export interface LoadStatusData {
  status?: string;
  job?: { job_id?: string; progress?: number; message?: string; error?: string } | null;
  payload?: LoadData | null;
}

export type Translate = (key: string, params?: Record<string, unknown>) => string;
