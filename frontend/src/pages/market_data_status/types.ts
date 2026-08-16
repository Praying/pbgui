/** Coin table row — shape pushed by /ws/market-data (PBApiServer.py coin_rows). */
export interface CoinRow {
  coin: string;
  last_fetch: string;
  result: string;
  lookback_days: string | number;
  minutes_written: string | number;
  newest_day: string;
  next_run_in_s: number | string | null;
  note: string;
}

/** Normalized status frame — legacy `currentStatus` defaults applied. */
export interface MarketDataStatus {
  running: boolean;
  queued: boolean;
  coins_done: number;
  coins_total: number;
  current_coin: string;
  coin_rows: CoinRow[];
}

/** Raw WebSocket frame (type === 'market_data_status' or an error carrier). */
export interface WsStatusMessage extends Partial<MarketDataStatus> {
  type?: string;
  error?: string;
}

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  leaving: boolean;
}
