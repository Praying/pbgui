/** Secret-free account row returned by the Profit Sweep overview endpoint. */
export interface OverviewAccount {
  name: string;
  display_name?: string;
  mode?: string;
  asset?: string;
  status?: string;
  level?: string;
  reason?: string;
  source_balance?: unknown;
  target_balance?: unknown;
  net_pnl?: unknown;
  swept?: unknown;
  sweep_due?: unknown;
  high_watermark?: unknown;
  max_transferable?: unknown;
  last_sweep?: unknown;
  next_check?: unknown;
  evaluated_at?: unknown;
  stale?: boolean;
}
