/** API payload types used by the Optimize workbench. */
export interface ConfigSummary {
  name: string;
  exchange?: string | string[];
  exchanges?: string[];
  strategy?: string;
  coins?: string[];
  coins_text?: string;
  modified?: string;
  backtest_count?: number;
  [key: string]: unknown;
}

export interface ConfigPayload {
  config: Record<string, unknown>;
  name?: string;
  param_status?: Record<string, unknown>;
  backend_hint?: string;
  override_configs?: Record<string, unknown>;
  migration_report?: Record<string, unknown>;
}

export interface QueueItem {
  filename: string;
  name?: string;
  json?: string;
  exchange?: string | string[];
  status?: string;
  pid?: number | null;
  created?: string;
  modified?: string;
  progress?: {
    eval?: number | null;
    target_iters?: number | null;
    estimated?: boolean;
    percent?: number | null;
    evaluation_scan?: {
      complete?: boolean;
      percent?: number;
    } | null;
  };
  [key: string]: unknown;
}

export interface ResultSummary {
  path: string;
  name?: string;
  config_name?: string;
  modified?: string;
  exchange?: string;
  strategy?: string;
  coins_text?: string;
  [key: string]: unknown;
}

export interface ParetoItem {
  path: string;
  name: string;
  modified?: string;
  summary?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParetoMeta {
  mode?: string;
  scenario_labels?: string[];
  available_statistics?: string[];
  selected_scenario?: string;
  selected_statistic?: string;
  statistic_enabled?: boolean;
  summary_keys?: string[];
  /** Full numeric metric catalog advertised by the result (PB8). */
  available_metrics?: string[];
  /** Server-side default projection (gain + objectives + drawdown_worst). */
  default_metrics?: string[];
  /** PB8 Sweep plan metadata attached to Pareto results. */
  sweep_cycles?: {
    enabled?: boolean;
    holdout_count?: number;
    holdout_scenarios?: ScenarioWindow[];
    [key: string]: unknown;
  };
}

export interface ScenarioWindow {
  label?: string;
  start_date: string;
  end_date: string;
  exchanges?: string[];
  [key: string]: unknown;
}

export interface ScenarioTemplatePreview {
  contract_version?: number;
  template: string;
  template_version?: number;
  parameters?: Record<string, unknown>;
  training_scenarios: ScenarioWindow[];
  holdout_scenarios: ScenarioWindow[];
  reducer?: Record<string, string>;
  warnings?: string[];
  provenance?: Record<string, unknown>;
}

export interface OhlcvStartDateProgress {
  percent?: number;
  completed?: number;
  total?: number;
  message?: string;
  [key: string]: unknown;
}

export interface OhlcvStartDateJob {
  job_id?: string;
  status: 'queued' | 'running' | 'stopping' | 'completed' | 'stopped' | 'error' | string;
  progress?: OhlcvStartDateProgress;
  result?: {
    start_date_options?: Record<string, {
      available?: boolean;
      start_date?: string;
      data_date?: string;
      detail?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  error?: string;
  stop_requested?: boolean;
  [key: string]: unknown;
}

export interface OptimizeSettings {
  autostart: boolean;
  cpu: number;
  cpu_override: boolean;
  use_pbgui_market_data: boolean;
  cpu_max: number;
  host_cpu_count: number;
  [key: string]: unknown;
}
