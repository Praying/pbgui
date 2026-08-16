/*
 * M-data-6 shared inventory types — the wire payloads of the inventory
 * panel (legacy market_data_main.html view state :6201-6229 + the REST
 * payloads of /inventory/* and /heatmap/*).
 *
 * Server fields are `unknown` exactly where legacy read them defensively
 * through String()/Number()/Boolean(); narrowing happens at the single
 * read site (lib/inventory*.ts).
 */

/** One /inventory/{exchange} row (renderInventoryTable input :8050-8059). */
export interface InventoryRow {
  row_id?: unknown;
  coin?: unknown;
  dataset?: unknown;
  timeframe?: unknown;
  is_xyz?: unknown;
  mapping_status?: unknown;
  n_files?: unknown;
  size?: unknown;
  total_bytes?: unknown;
  oldest_day?: unknown;
  newest_day?: unknown;
  n_days?: unknown;
  expected_hours?: unknown;
  coverage_pct?: unknown;
  missing_days_count?: unknown;
  missing_days_sample?: unknown;
  hl_minutes?: unknown;
  other_minutes?: unknown;
  missing_minutes?: unknown;
  [key: string]: unknown;
}

/** GET /inventory/{exchange} payload (:8690-8698). */
export interface InventoryPayload {
  success?: boolean;
  error?: string;
  view_label?: string;
  helper_note?: string;
  empty_message?: string;
  include_missing_current?: boolean;
  include_missing_supported?: boolean;
  metrics?: unknown;
  rows?: unknown;
  available_coins?: unknown;
  [key: string]: unknown;
}

/** One summary card (renderInventoryMetrics :7859-7865). */
export interface InventoryMetric {
  label?: unknown;
  value?: unknown;
}

/** GET /heatmap/info payload (:8651, renderInventoryHeatmapControls :8532-8534). */
export interface HeatmapInfo {
  is_candles?: boolean;
  is_stock_perp?: boolean;
  months?: unknown;
  [key: string]: unknown;
}

/** GET /heatmap/overview|minutes payloads (:8659, :8607). */
export interface HeatmapFigurePayload {
  figure?: unknown;
  legend_html?: unknown;
  error?: string | null;
  [key: string]: unknown;
}

/** POST preview-delete-older payload (loadInventoryOlderPreview :8321-8330). */
export interface OlderPreviewPayload {
  success?: boolean;
  error?: string;
  would_delete_files?: unknown;
  would_delete_size?: unknown;
  would_delete_size_label?: unknown;
  [key: string]: unknown;
}

/** Panel/gap feedback callout (setInventoryBox :7818-7830). */
export interface InventoryFeedback {
  message: string;
  level: 'info' | 'error';
}

/** Queue job result (runInventoryBuildBest1m :8453-8458). */
export interface QueueResultPayload {
  success?: boolean;
  error?: string;
  message?: string;
  job_id?: unknown;
  coins_count?: unknown;
  start_day?: unknown;
  end_day?: unknown;
  [key: string]: unknown;
}

/** The hyperliquid l2book archive range (runInventoryBuildBest1m :8423-8431). */
export interface L2BookDownloadInfo {
  has_aws_creds?: boolean;
  archive_range?: { oldest_day?: unknown; newest_day?: unknown } | null;
  [key: string]: unknown;
}
