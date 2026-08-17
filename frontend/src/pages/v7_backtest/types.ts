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
