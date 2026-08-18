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
