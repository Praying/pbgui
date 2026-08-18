/** VPS Monitor WebSocket state and command payloads. */
export interface Metrics {
  timestamp?: number;
  cpu?: number;
  cpu_60s?: number;
  cpu_60s_window?: number;
  mem_total?: number;
  mem_available?: number;
  mem_used?: number;
  mem_percent?: number;
  disk_total?: number;
  disk_used?: number;
  disk_free?: number;
  disk_percent?: number;
  swap_total?: number;
  swap_used?: number;
  swap_free?: number;
  swap_percent?: number;
  [key: string]: unknown;
}

export interface ConnectionInfo { status?: string; ip?: string; error?: string; last_error?: string; [key: string]: unknown; }
export interface InstanceRecord { name?: string; u?: string; p?: string; pb_version?: string; st?: number; c?: number; cpu?: number; cpu_60s?: number; cpu_60s_window?: number; pt?: number; pnlToday?: number; pnl_hist_total?: number; pnl4w?: number; ct?: number; fillsToday?: number; pnls_hist_total?: number; fills4w?: number; et?: number; errors_4w?: number; tt?: number; tracebacks_4w?: number; e?: string; t?: string; i?: string; status?: string; [key: string]: unknown; }
export interface ServiceCheck { status?: string; pid?: number; expected?: boolean; reason?: string; error?: string; [key: string]: unknown; }
export interface AgentFile { state?: string; age?: number; [key: string]: unknown; }
export interface AgentInfo { state?: string; age?: number; error?: string; collector?: Record<string, unknown>; files?: Record<string, AgentFile>; [key: string]: unknown; }
export interface VpsState {
  connections?: { total?: number; connected?: number; connecting?: number; disconnected?: number; connections?: Record<string, ConnectionInfo> };
  system?: Record<string, Metrics>;
  instances?: Record<string, InstanceRecord[]>;
  v7_instances?: Record<string, InstanceRecord[]>;
  v8_instances?: Record<string, InstanceRecord[]>;
  host_meta?: Record<string, Record<string, unknown>>;
  services?: Record<string, Record<string, ServiceCheck>>;
  streams?: Record<string, { monitor_agent?: AgentInfo; [key: string]: unknown }>;
  local_logs?: string[];
  ui_settings?: Record<string, string>;
  timestamp?: number;
  [key: string]: unknown;
}

export interface HistoryPoint { ts?: number; value?: number; [key: string]: unknown; }
export interface HistoryPayload { points?: HistoryPoint[]; days?: string[]; values?: number[]; [key: string]: unknown; }
