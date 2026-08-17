/**
 * Strategy Explorer page types — shapes of the API payloads consumed by
 * frontend/v7_strategy_explorer.html (the legacy spec). Provenance comments
 * reference the legacy functions that read each field.
 */

/** JSON blob of a PB7/PB8 strategy config (edited in place via paths). */
export type StrategyConfig = Record<string, unknown>;

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StrategyOrder {
  index?: number;
  qty?: number;
  price?: number;
  max_twe_pct_after?: number;
  order_type?: string;
  type?: string;
}

export interface FillEvent {
  timestamp?: string;
  time?: string;
  date?: string;
  timestamp_ms?: string | number;
  event?: string;
  type?: string;
  order_type?: string;
  qty?: number;
  fill_qty?: number;
  price?: number;
  fill_price?: number;
  pos_size?: number;
  pos_price?: number;
  wallet_balance?: number;
  wallet_exposure?: number;
}

export interface SideDebugState {
  ema_bands?: { upper?: number; lower?: number };
  balance?: number;
  entry_volatility_logrange_ema_1h?: number;
}

export interface SideDebug {
  entry_input?: Record<string, unknown>;
  entry_output_decoded?: unknown[];
  entry_gridonly_output_decoded?: unknown[];
  potential_trailing?: { gridfirst_cutoff_price?: number } & Record<string, unknown>;
  next_entry_current?: Record<string, unknown>;
  forced_trailing_chain?: Record<string, unknown>;
  next_entry_error?: string;
  state_params?: SideDebugState;
  exchange_params?: Record<string, number>;
  position_close?: { price?: number };
}

export interface SideSummary {
  entry_orders?: number;
  entry_avg_price?: number;
  entry_grid_pct?: number;
  wallet_exposure_limit_per_position?: number;
}

export interface SideOrders {
  entries?: StrategyOrder[];
  closes?: StrategyOrder[];
  normal_entries?: StrategyOrder[];
  gridonly_entries?: StrategyOrder[];
  gridonly_closes?: StrategyOrder[];
  simulated_entry_trailing?: StrategyOrder[];
  potential_entry_trailing_prices?: number[];
}

export interface SnapshotSide {
  active?: boolean;
  modes?: { entry?: string; close?: string };
  summary?: SideSummary;
  orders?: SideOrders;
  params?: Record<string, unknown>;
  visual_params?: Record<string, unknown>;
  debug?: SideDebug;
}

/** `snapshot.market.metadata.derived` — sources for exchange param steppers (:1943-1955). */
export interface MarketMetadataDerived {
  min_cost_from_limits?: { cost?: { min?: number } };
  price_step_from_precision?: { price?: number };
  min_qty_from_limits?: { amount?: { min?: number } };
  qty_step_from_precision?: { amount?: number };
  c_mult_from_contractSize?: number;
}

export interface MarketMetadata {
  ohlcv_source?: string;
  ohlcv?: {
    selected_start?: string;
    grid_time?: string;
    rows?: number;
  };
  derived?: MarketMetadataDerived;
  market_metadata?: { derived?: MarketMetadataDerived };
}

export interface SnapshotMarket {
  exchange?: string;
  coin?: string;
  reference_price?: number;
  engine_status?: string;
  ohlcv_status?: string;
  metadata?: MarketMetadata;
}

export interface PageMessage {
  level?: string;
  text?: string;
  message?: string;
}

export interface ParamGroup {
  key: string;
  label: string;
  fields: string[];
}

export interface ParamFieldMeta {
  type?: 'bool' | 'boolean' | 'select' | 'string' | 'text' | 'number';
  options?: unknown[] | (() => unknown[]);
  label?: string;
  path?: string;
  global?: boolean;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}

export interface SimulationMode {
  key: string;
  label?: string;
}

export interface PageConfig {
  strategy_label?: string;
  simulation_modes?: SimulationMode[];
  hsl_signal_modes?: string[];
}

export interface StrategySnapshot {
  title?: string;
  source?: string;
  config?: StrategyConfig;
  market?: SnapshotMarket;
  candles?: Candle[];
  sides?: { long?: SnapshotSide; short?: SnapshotSide };
  messages?: PageMessage[];
  param_groups?: Array<Partial<ParamGroup> & Record<string, unknown>> | Record<string, unknown> | null;
  param_field_meta?: Record<string, ParamFieldMeta>;
}

export interface MarketsData {
  exchanges?: string[];
  coins_by_exchange?: Record<string, string[]>;
}

export interface SimulationData {
  ok?: boolean;
  message?: string;
  events?: { long?: FillEvent[]; short?: FillEvent[] };
  candles?: Candle[];
  metadata?: { start_timestamp_ms?: number; end_timestamp_ms?: number };
}

export interface CompareRow extends Record<string, unknown> {
  compare_index?: number | string;
  status?: string;
}

export interface CompareData {
  ok?: boolean;
  message?: string;
  sources?: Record<string, string | { label?: string }> | string[] | { key: string; label?: string }[];
  status_labels?: Record<string, string>;
  summary?: {
    events?: Record<string, { long?: number; short?: number; total?: number }>;
    coverage?: { partial?: boolean };
    long?: Record<string, number>;
    short?: Record<string, number>;
  };
  rows?: { long?: CompareRow[]; short?: CompareRow[] };
}

export interface MovieFrameCandle {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export interface MovieFrame {
  index?: number;
  timestamp: string;
  candle?: MovieFrameCandle;
  long?: SnapshotSide;
  short?: SnapshotSide;
}

export interface MovieMetadata {
  exchange?: string;
  coin?: string;
  engine?: string;
  start_time?: string;
  step_mins?: number;
  start_timestamp_ms?: number;
  end_timestamp_ms?: number;
  displayed_fill_count?: number;
  total_fill_count?: number;
  fills_truncated?: boolean;
  displayed_fill_end_timestamp_ms?: number;
  orders_available?: boolean;
}

export interface MovieData {
  ok?: boolean;
  engine?: string;
  message?: string;
  metadata?: MovieMetadata;
  events?: { long?: FillEvent[]; short?: FillEvent[] };
  frames?: MovieFrame[];
}

/** `/session` payload (:200-215 get_session, :3080 applySessionBootstrap). */
export interface SessionData {
  page?: PageConfig;
  snapshot?: StrategySnapshot;
  handoff?: {
    provenance_available?: boolean;
    compare_available?: boolean;
    fill_start?: string;
    fill_end?: string;
  };
  movie?: { message?: string };
  result_path?: string;
  messages?: PageMessage[];
}

export interface ProgressData {
  progress?: number;
  message?: string;
  done?: boolean;
}

/** Options payload shared by /snapshot, /simulate, /compare, /movie/* (:1055-1071). */
export interface ExplorerOptions extends Record<string, unknown> {
  draft_id?: string;
  ohlcv_source?: string;
  exchange?: string;
  coin?: string;
  start_date?: string;
  start_time?: string;
  reference_price?: number;
  balance?: number;
  auto_fill_exchange_params?: boolean;
  exchange_params?: Record<string, number>;
  state_params?: Record<string, number>;
  load_candles?: boolean;
  context_days?: number;
}

export interface ExportCodec {
  id: string;
  label?: string;
}

export interface MovieExportOptionsData {
  codecs?: ExportCodec[];
  defaults?: Record<string, unknown>;
  encoder?: { label?: string };
}

/** sessionStorage refresh-cache payload (:794-816). */
export interface RefreshControls {
  stage?: string;
  exchange?: string;
  coin?: string;
  start_date?: string;
  start_time?: string;
  balance?: string;
  reference_price?: string;
  context_days?: string;
  movie_start_date?: string;
  movie_start_time?: string;
  movie_step?: string;
  movie_duration?: string;
  movie_frames?: string;
  movie_visible?: string;
  movie_side?: string;
  movie_generated?: boolean;
}

export interface RefreshCachePayload {
  saved_at: number;
  config: StrategyConfig;
  controls: RefreshControls;
  movie_data: MovieData | null;
}
