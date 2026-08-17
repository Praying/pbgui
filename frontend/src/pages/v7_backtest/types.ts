/** Backtest page shared types (M-v7-8 slice of v7_backtest.html). */

export type BacktestVersion = 'v7' | 'v8';

/** Panel vocabulary — schema-frozen for the persisted view state (R2, :1354). */
export type BacktestPanel = 'configs' | 'queue' | 'results' | 'archive' | 'legacy';

/** Archive results modes (:1339-1341). */
export type ArchiveMode = 'backtests' | 'optimize' | 'schedules';

/** Queue entry pushed over `ws/bt7` (:1276). */
export interface QueueItem {
  filename: string;
  name?: string;
  status?: string;
  exchange?: string | string[];
  created?: string;
}

/** Backtest settings shape (:1046 defaults; /settings replaces it wholesale). */
export interface BacktestSettings {
  autostart: boolean;
  cpu: number;
  cpu_max: number | null;
  hsl_signal_modes: string[];
  exchange_options: unknown[];
  use_pbgui_market_data: boolean;
  hlcvs_cleanup_enabled: boolean;
  hlcvs_cleanup_days: number;
  hlcvs_cleanup_interval_h: number;
}

/** The six fields the settings modal can save (:1602-1612). */
export interface SettingsPatch {
  cpu: number;
  autostart: boolean;
  use_pbgui_market_data: boolean;
  hlcvs_cleanup_enabled: boolean;
  hlcvs_cleanup_days: number;
  hlcvs_cleanup_interval_h: number;
}

/** Sort spec for one table inside the persisted view state. */
export interface SortSpec {
  col: string;
  asc: boolean;
}

export type BacktestSortTable = 'configs' | 'results' | 'archive' | 'legacy';

export type BacktestSorts = Record<BacktestSortTable, SortSpec>;

/** Resolved view state — hash > storage > default (:1395-1411). */
export interface BacktestViewState {
  panel: BacktestPanel;
  archive?: string;
  archiveMode?: ArchiveMode;
  sorts: BacktestSorts;
}

/** Sidebar nav entry (adapter.navItems, backtest_editor_adapter.js:153-164). */
export interface NavItem {
  panel: BacktestPanel;
  icon: string;
  /** i18n key resolved by the renderer. */
  labelKey: string;
  /** The queue nav item is badged (:156). */
  badge?: boolean;
}

/** Configs list entry (/configs → d.configs, :1648-1650; list UI is M-v7-9). */
export interface ConfigSummary {
  name: string;
  exchanges?: string | string[];
  strategy?: string;
  coins?: number;
  twe_long?: number | null;
  twe_short?: number | null;
  start_date?: string;
  end_date?: string;
  results?: number;
  modified?: string;
}

/* ── Results view (M-v7-10) ─────────────────────────────────────────── */

/** The results version filter (:839-841, seeded from the flavor :10010). */
export type ResultsVersionFilter = 'v7' | 'v8' | 'both';

/** The five per-result icon toggles (:5566-5570). */
export type ResultActionKind = 'view' | 'analysis' | 'config' | 'plot' | 'fills';

/** One /results row (:5389-5392 — backtest_version is tagged client-side). */
export interface BacktestResultItem {
  path: string;
  config_name: string;
  result_name: string;
  exchange_dir?: string;
  backtest_version: BacktestVersion;
  modified?: string;
  adg?: number | null;
  gain?: number | null;
  drawdown_worst?: number | null;
  sharpe_ratio?: number | null;
  starting_balance?: number | null;
  final_balance?: number | null;
  twe_long?: number | null;
  twe_short?: number | null;
  pos_long?: number | null;
  pos_short?: number | null;
  coins?: string[];
  coins_text?: string;
  exchanges?: string[];
  display_name?: string;
  strategy?: string;
  liquidated?: boolean;
  btc_collateral_cap?: number;
  equity_balance_diff_neg_max?: number;
  end_date?: string;
  /** Preloaded analysis payload (skips the /results/analysis fetch, :7534). */
  analysis?: unknown;
}

/** Parsed results CSV (parseCsv, :5422-5437). */
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Normalized equity series (normalizeBE, :6920-6966). */
export interface BeSeries {
  time: string[];
  balance: number[];
  equity: number[];
  balance_btc: number[];
  equity_btc: number[];
}

/** Bounded price payload from /results/price (:6811-6823). */
export interface PricePayload {
  available?: boolean;
  time?: string[];
  close?: number[];
  coverage_start?: string;
  coverage_end?: string;
  coverage_complete?: boolean;
  exchange?: string;
  coin?: string;
}
