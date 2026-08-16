import { onScopeDispose, ref, type Ref } from 'vue';
import type { MarketDataStatus, WsStatusMessage } from './types';

/**
 * useStatusWs — the monitor's /ws/market-data connection
 * (frontend/market_data_status.html:392-434):
 *
 *  - connects to the exchange-scoped URL on creation (legacy IIFE);
 *  - reconnects forever with exponential back-off min(1000 * 2^attempts, 30 s),
 *    where `attempts` increments BEFORE the delay computation (first retry
 *    2 s) and resets to 0 on open;
 *  - onmessage: JSON.parse → frames with an `error` field are dropped (legacy
 *    updateConnectionStatus is a no-op), frames with
 *    type === 'market_data_status' replace the status ref after the legacy
 *    `currentStatus` defaults are applied;
 *  - onerror: no-op (legacy only fed the same no-op connection status).
 *
 * Deviations (documented): parse failures are swallowed (the legacy handler
 * would throw into window.onerror — observably identical, table not updated);
 * disconnect() detaches handlers before close so a late close event cannot
 * schedule a reconnect (the legacy destroyMonitor did the same).
 */

/* legacy market_data_status.html:348, 421 — verbatim constants */
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30000;

/** Legacy `Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)`. */
export function reconnectDelayMs(attempts: number): number {
  return Math.min(RECONNECT_BASE_MS * Math.pow(2, attempts), RECONNECT_MAX_MS);
}

/** The subset of WebSocket the composable touches (tests fake this). */
export interface WebSocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
}

/** Apply the legacy `currentStatus` defaults to a status frame. */
export function normalizeStatus(frame: WsStatusMessage): MarketDataStatus {
  return {
    running: Boolean(frame.running),
    queued: Boolean(frame.queued),
    coins_done: Number(frame.coins_done ?? 0),
    coins_total: Number(frame.coins_total ?? 0),
    current_coin: String(frame.current_coin ?? ''),
    coin_rows: Array.isArray(frame.coin_rows) ? frame.coin_rows : [],
  };
}

export interface StatusWsOptions {
  /** Exchange-scoped /ws/market-data URL (config.wsUrl). */
  url: string;
  /** Injectable WebSocket constructor (tests); defaults to global WebSocket. */
  wsFactory?: (url: string) => WebSocketLike;
}

export interface StatusWsController {
  /** Latest market_data_status frame; null before the first one. */
  readonly status: Ref<MarketDataStatus | null>;
  /** Legacy connectWebSocket() — clear the timer and (re)connect now. */
  connect(): void;
  /** Legacy destroyMonitor() — stop reconnecting, close and detach handlers. */
  disconnect(): void;
}

export function useStatusWs(options: StatusWsOptions): StatusWsController {
  const wsFactory = options.wsFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);

  const status = ref<MarketDataStatus | null>(null);
  let ws: WebSocketLike | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function handleMessage(data: unknown): void {
    let frame: WsStatusMessage;
    try {
      frame = JSON.parse(String(data)) as WsStatusMessage;
    } catch {
      /* legacy threw into window.onerror; swallowing keeps the table untouched either way */
      return;
    }
    if (frame.error) return; // legacy updateConnectionStatus(false, error) no-op
    if (frame.type === 'market_data_status') {
      status.value = normalizeStatus(frame);
    }
  }

  function connect(): void {
    if (destroyed) return;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws = wsFactory(options.url);
    ws.onopen = () => {
      reconnectAttempts = 0;
    };
    ws.onmessage = (evt) => handleMessage(evt.data);
    ws.onclose = () => {
      if (!destroyed) {
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(connect, reconnectDelayMs(reconnectAttempts));
      }
    };
    ws.onerror = () => {
      /* legacy fed the no-op updateConnectionStatus */
    };
  }

  function disconnect(): void {
    destroyed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const current = ws;
    ws = null;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      current.close();
    }
  }

  connect(); // legacy IIFE connects at fragment load
  onScopeDispose(disconnect);

  return { status, connect, disconnect };
}
