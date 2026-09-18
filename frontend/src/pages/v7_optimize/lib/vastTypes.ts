export interface VastOffer {
  id?: string | number;
  gpu_name?: string;
  machine_id?: number;
  vram_gb?: number;
  ram_gb?: number;
  cpu_cores?: number;
  cpu_name?: string;
  tflops?: number;
  price_hour_usd?: number;
  download_gb_usd?: number;
  upload_gb_usd?: number;
  inet_down_mbps?: number;
  inet_up_mbps?: number;
  location?: string;
  reliability?: number;
  verified?: boolean;
  cuda_max_good?: number;
  duration_seconds?: number;
  disk_gb?: number;
  host_history?: VastHostProfile;
  [key: string]: unknown;
}

export interface VastHostProfile {
  machine_id: number;
  used?: boolean;
  working?: boolean;
  working_detected?: boolean;
  working_marked?: boolean;
  preferred?: boolean;
  rentals?: number;
}

export interface VastRental {
  id?: string;
  deadline?: number;
  budget_usd?: number;
  transfer_reserve_usd?: number;
  deadline_protocol?: number;
  deadline_pending?: boolean;
  deadline_error?: string;
  offer?: VastOffer;
}

export interface VastProgress {
  bytes?: number;
  total_bytes?: number;
  files?: number;
  total_files?: number;
  stage?: string;
  status?: string;
  retry_at?: number;
  attempt?: number;
  [key: string]: unknown;
}

export interface VastThroughput {
  proxy_per_minute?: number;
  exact_per_minute?: number;
  proxy_total?: number;
  exact_total?: number;
  proxy_exact_ratio?: number;
  exact_per_usd?: number;
  sampled_at?: number;
  final?: boolean;
  [key: string]: unknown;
}

export interface VastRuntimeMetrics {
  gpu_percent?: number;
  cpu_percent?: number;
  ram_used_bytes?: number;
  ram_total_bytes?: number;
  vram_used_bytes?: number;
  vram_total_bytes?: number;
  sampled_at?: number;
  [key: string]: unknown;
}

export interface VastJob {
  id: string;
  config_name?: string;
  status?: string;
  error?: string;
  stop_requested?: boolean;
  can_delete?: boolean;
  final_collected?: boolean;
  result_path?: string;
  result_partial?: boolean;
  preparation_progress?: VastProgress;
  upload_progress?: VastProgress;
  image_progress?: VastProgress;
  runtime_metrics?: VastRuntimeMetrics;
  throughput?: VastThroughput;
  cost_estimate?: { compute_usd?: number; transfer_usd?: number; total_usd?: number };
  rental?: VastRental;
  [key: string]: unknown;
}

export interface VastWorker {
  id?: string;
  rental_state?: string;
  status?: string;
  awaiting_queue_start?: boolean;
  host_machine_id?: number;
  rental?: VastRental;
  [key: string]: unknown;
}

export interface VastPreferences {
  gpu_name: string;
  max_price: number;
  min_vram: number;
  min_ram: number;
  min_cpu: number;
  min_tflops: number;
  disk_gb: number;
  verified_only: boolean;
  hours: number;
  budget: number;
  idle_seconds: 0 | 300;
  convergence_enabled: boolean;
  convergence_min_exact: number;
  convergence_patience: number;
  convergence_tolerance_pct: number;
}

export interface VastCounterSample {
  sampled_at: number;
  proxy_total: number;
  exact_total: number;
}

export interface VastPerformanceRun {
  id: string;
  config_name?: string;
  status?: string;
  stop_reason?: string;
  fingerprint?: string | null;
  workers?: number;
  comparable_host_runs?: number | null;
  startup_to_first_counter_seconds?: number | null;
  hardware?: VastOffer;
  workload?: {
    coins?: string[];
    exchanges?: string[];
    scenario_count?: number;
    exported_candles?: number | null;
    exported_symbols?: number;
    resolutions?: string[];
    start_date?: string;
    end_date?: string;
    parameter_count?: number | null;
    population_size?: number | null;
    seed?: number | null;
    revision?: string;
    [key: string]: unknown;
  };
  summary?: {
    proxy_per_minute?: number | null;
    exact_per_minute?: number | null;
    proxy_rate_min?: number | null;
    proxy_rate_max?: number | null;
    exact_rate_min?: number | null;
    exact_rate_max?: number | null;
    exact_per_usd?: number | null;
    covered_seconds?: number;
    samples?: number;
    [key: string]: unknown;
  };
  cost_estimate?: { compute_usd?: number | null; transfer_usd?: number; total_usd?: number | null };
  series?: { counter?: VastCounterSample[]; telemetry?: Array<Record<string, unknown>> };
  [key: string]: unknown;
}
