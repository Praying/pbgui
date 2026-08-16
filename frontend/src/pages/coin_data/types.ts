/**
 * Coin Data server shapes — the /state payload contract of api/coin_data.py
 * `_build_state` (:623-684) plus the refresh-job shape (:126-139).
 */

export interface CmcPoolStatus {
  ready?: boolean;
  active_credentials?: number;
  error?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface CoinDataMainRow {
  [key: string]: unknown;
  coin: string;
  ccxt_symbol: string;
  base: string;
  quote: string;
  copy_trading: boolean;
  cmc_id?: unknown;
  cmc_rank?: unknown;
  cmc_link?: string;
  price?: number | null;
  market_cap?: number | null;
  volume_24h?: number | null;
  vol_mcap?: number | null;
  tags: string[];
  notice: string;
  contract_size?: unknown;
  min_amount?: unknown;
  min_cost?: unknown;
  precision_amount?: unknown;
  max_leverage?: unknown;
  min_order_price?: unknown;
}

export interface CoinDataUnmatchedRow {
  [key: string]: unknown;
  coin: string;
  symbol: string;
  base?: string;
  quote?: string;
  ccxt_symbol?: string;
}

export interface CoinDataHip3Row {
  [key: string]: unknown;
  dex: string;
  coin: string;
  ccxt_symbol: string;
  quote: string;
  cmc_link?: string;
  price?: number | null;
  volume_24h?: number | null;
  copy_trading: boolean;
  notice: string;
  contract_size?: unknown;
  min_amount?: unknown;
  min_cost?: unknown;
  precision_amount?: unknown;
  max_leverage?: unknown;
  min_order_price?: unknown;
}

/** GET /state response (_build_state :623-684). */
export interface CoinDataState {
  cmc_pool: CmcPoolStatus;
  filters: {
    exchange: string;
    market_cap: number;
    vol_mcap: number;
    tags: string[];
    only_cpt: boolean;
    hide_notices: boolean;
  };
  options: {
    exchanges: string[];
    tags: string[];
    quote_filter: string[];
    vol_mcap_values: number[];
  };
  meta: {
    cmc_line: string;
    cmc_line_detail: string;
    exchange_line: string;
    exchange_line_detail: string;
    timestamps: Record<string, number | null>;
  };
  counts: {
    main: number;
    unmatched_visible: number;
    unmatched_all: number;
    hip3: number;
  };
  sections: {
    unmatched_title: string;
    main_title: string;
    hip3_title: string;
  };
  warnings: string[];
  rows: CoinDataMainRow[];
  unmatched_rows: CoinDataUnmatchedRow[];
  hip3_rows: CoinDataHip3Row[];
}

/** Refresh-job payload (POST /refresh/* reply :796 and job poll :748). */
export interface CoinDataRefreshJob {
  id: string;
  title: string;
  message: string;
  status: string;
  percent: number;
  step: number;
  total: number;
  result_message: string;
  error: string;
  state: CoinDataState | null;
  created_at: number;
  updated_at: number;
}

export type TableViewName = 'main' | 'unmatched' | 'hip3';

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}
