/**
 * HL data-actions server shapes — /heatmap/{l2book-download-info,
 * build-ohlcv-info} payloads, the /jobs record shape and the WS /ws/jobs
 * message envelope.
 */

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
  type: string;
  status: string;
  exchange?: string;
  created_ts?: number | string;
  updated_ts?: number | string;
  error?: string;
  run_requested?: boolean;
  cancel_requested?: boolean;
  payload?: Record<string, unknown>;
  progress?: JobProgress;
  [key: string]: unknown;
}

/** GET /heatmap/l2book-download-info. */
export interface L2bookDownloadInfo {
  coins: string[];
  has_aws_creds: boolean;
  archive_range: { oldest_day: string; newest_day: string };
}

/** GET /heatmap/build-ohlcv-info. */
export interface BuildOhlcvInfo {
  eligible_coins: string[];
  coins_with_downloaded_history: string[];
}

/** Queue reply for both POST endpoints (error XOR queued fields). */
export interface QueueReply {
  error?: string;
  job_id?: string;
  coins_count?: number;
  start_day?: string;
  end_day?: string;
  refetch?: boolean;
  missing_coins?: string[];
}

/** The job-type matrix (JOB_TYPES :1617). */
export const JOB_TYPES = {
  dl: 'hl_aws_l2book_auto',
  build: 'hl_best_1m',
} as const;

export type SectionNs = 'dl' | 'build';
