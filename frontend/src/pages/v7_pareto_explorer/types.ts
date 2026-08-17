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
  command_center?: CommandCenterPayload | null;
  selected_config_index?: number | null;
  detail?: ConfigDetailPayload | null;
  playground?: PlaygroundPayload | null;
  deep_intelligence?: { tab?: string; payload?: unknown } | null;
}

/** One rendered Plotly figure — server-built traces + layout (:3379-3392). */
export interface ChartSpec {
  traces?: unknown[];
  layout?: Record<string, unknown> | null;
}

export interface PlaygroundMetrics {
  x_metric?: string;
  y_metric?: string;
  z_metric?: string;
  color_metric?: string;
}

export interface PlaygroundBestMatch {
  config_index?: number | null;
  score?: number | null;
  style?: string;
}

export interface PlaygroundCounts {
  configs?: number;
  total_configs?: number | null;
  pareto?: number;
  show_all?: boolean;
}

/** renderPreview's payload — counts + the two preview figures (:2890-2942). */
export interface PlaygroundPreviewPayload {
  counts?: PlaygroundCounts | null;
  pareto_analysis?: ChartSpec | null;
  robustness?: ChartSpec | null;
}

export interface PlaygroundPayload {
  viz_type?: string;
  quick_view?: string;
  metrics?: PlaygroundMetrics | null;
  available_metrics?: string[];
  best_match?: PlaygroundBestMatch | null;
  counts?: PlaygroundCounts | null;
  visualizations?: {
    preview?: PlaygroundPreviewPayload | null;
    scatter_2d?: ChartSpec | null;
    scatter_3d?: ChartSpec | null;
    radar?: ChartSpec | null;
    projections?: { xy?: ChartSpec | null; xz?: ChartSpec | null; yz?: ChartSpec | null } | null;
  } | null;
}

/** renderChampions rows (:2944-2973). */
export interface ChampionItem {
  config_index?: number | null;
  style?: string;
  composite_score?: number | null;
  performance?: number | null;
  robustness?: number | null;
  risk_overall?: number | null;
}

/** renderInsights rows (:2975-2990). */
export interface InsightItem {
  level?: string;
  text?: string;
}

export interface CommandCenterPayload {
  champions?: ChampionItem[];
  insights?: InsightItem[];
}

export interface MetricEntry {
  name?: string;
  value?: unknown;
}

/** /config-detail payload → renderDetail (:3849-3893). */
export interface ConfigDetailPayload {
  config_index?: number | null;
  full_config?: Record<string, unknown> | null;
  top_metrics?: MetricEntry[];
  risk_profile?: Record<string, unknown> | null;
  all_metrics?: MetricEntry[];
  style?: string;
  explorer_score?: number | null;
  robustness?: number | null;
  has_scenarios?: boolean;
  scenario_metrics?: Record<string, Record<string, unknown>> | null;
  override_configs?: Record<string, unknown> | null;
  override_error?: string | null;
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
  payload: PlaygroundPayload | null;
}

/** Load-progress job status response (:2520-2555). */
export interface LoadStatusData {
  status?: string;
  job?: { job_id?: string; progress?: number; message?: string; error?: string } | null;
  payload?: LoadData | null;
}

export type Translate = (key: string, params?: Record<string, unknown>) => string;
