/** Shared Jobs Monitor API records and distributed downloader shapes. */
export interface JobProgress {
  coin?: string;
  chunk_start?: string;
  chunk_end?: string;
  chunk_done?: number;
  chunk_total?: number;
  step?: number;
  total?: number;
  stage?: string;
  mode?: string;
  downloaded_total?: number;
  downloaded_bytes_total?: number;
  skipped_existing_total?: number;
  skipped_existing_bytes_total?: number;
  failed_total?: number;
  failed_bytes_total?: number;
  last_result?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface JobRecord {
  id: string;
  type?: string;
  status?: string;
  exchange?: string;
  created_ts?: number | string;
  updated_ts?: number | string;
  run_started_ts?: number | string;
  finished_ts?: number | string;
  error?: string;
  run_requested?: boolean;
  cancel_requested?: boolean;
  payload?: Record<string, unknown>;
  progress?: JobProgress;
  [key: string]: unknown;
}

export interface DownloaderRow {
  host: string;
  mode: string;
  status: string;
  segments: number;
  pages: number;
  rows: number;
  payloadBytes: number;
  minutesWritten: number;
  currentCoin: string;
  currentRange: string;
}

export type JobsTab = 'running' | 'done' | 'failed';
