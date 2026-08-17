/*
 * The run-list live-update WebSocket (v7_run.html:611-662, :1447-1458) —
 * the port of connectWS()/scheduleReconnect() with the legacy semantics:
 *
 *  - one socket at a time; a stale generation ignores every callback
 *    (socketGeneration guards the handlers, :618-652);
 *  - 'instances' messages replace the list AND bump loadGeneration so a
 *    slower in-flight REST fetch cannot clobber fresher WS data (:634);
 *  - close 4001 (auth logout/expiry) never reconnects; other closes and
 *    errors reconnect with exponential back-off 1 s → 30 s, reset on open;
 *  - beforeunload bumps the generation and closes the socket (:1454-1458).
 *
 * Deviations (documented): disconnect() also clears the reconnect timer and
 * detaches the handlers (the legacy leak fix), and the socket is injectable
 * for tests (wsFactory) the way useDashboardWs does it.
 */

import { onScopeDispose } from 'vue';

export const WS_RECONNECT_INITIAL_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30000;
/** Close code the API uses for "authentication gone" (logout/expiry). */
export const WS_AUTH_CLOSED_CODE = 4001;

/** The subset of WebSocket the controller touches (tests fake this). */
export interface WebSocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(): void;
  readonly readyState: number;
}

export type BannerState = 'ok' | 'lost' | 'waiting';

export interface RunWsOptions {
  url: string;
  /** WS 'instances' handler — receives the message data array (:633-637). */
  onInstances(data: unknown[]): void;
  /** Banner transitions (:627, :643-644, :650-651). */
  onBanner(state: BannerState): void;
  /** Injectable for tests; defaults to the global WebSocket. */
  wsFactory?: (url: string) => WebSocketLike;
  /** Injectable for tests; defaults to window.setTimeout/clearTimeout. */
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  /** Bind window-level cleanup (beforeunload); tests disable it. */
  bindBeforeUnload?: boolean;
}

export interface RunWsController {
  connect(): void;
  /** Legacy beforeunload handler — generation bump + timer clear + close. */
  disconnect(): void;
}

export function parseInstancesMessage(raw: unknown): unknown[] | null {
  try {
    const msg: unknown = JSON.parse(String(raw));
    if (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as { type?: unknown }).type === 'instances' &&
      Array.isArray((msg as { data?: unknown }).data)
    ) {
      return (msg as { data: unknown[] }).data;
    }
  } catch {
    /* legacy swallowed parse errors (:639) */
  }
  return null;
}

export function useRunWs(options: RunWsOptions): RunWsController {
  const wsFactory = options.wsFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
  const timers = options.timers ?? { setTimeout, clearTimeout };

  let ws: WebSocketLike | null = null;
  let socketGeneration = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = WS_RECONNECT_INITIAL_MS;

  function scheduleReconnect(): void {
    if (reconnectTimer !== null) return; // :656
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      connect();
      reconnectDelay = Math.min(reconnectDelay * 2, WS_RECONNECT_MAX_MS); // :660
    }, reconnectDelay);
  }

  function connect(): void {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return; // :617
    const generation = ++socketGeneration;
    const socket = wsFactory(options.url);
    ws = socket;

    socket.onopen = () => {
      if (generation !== socketGeneration) {
        socket.close();
        return;
      }
      reconnectDelay = WS_RECONNECT_INITIAL_MS; // :625
      options.onBanner('ok');
    };

    socket.onmessage = (ev) => {
      if (generation !== socketGeneration) return;
      const data = parseInstancesMessage(ev.data);
      if (data) options.onInstances(data);
    };

    socket.onclose = (event) => {
      if (generation !== socketGeneration) return;
      options.onBanner('lost');
      if (event && event.code === WS_AUTH_CLOSED_CODE) return; // :645
      scheduleReconnect();
    };

    socket.onerror = () => {
      if (generation !== socketGeneration) return;
      options.onBanner('lost');
    };
  }

  function disconnect(): void {
    socketGeneration += 1; // :1455
    if (reconnectTimer !== null) {
      timers.clearTimeout(reconnectTimer);
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

  if (options.bindBeforeUnload !== false && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', disconnect);
    onScopeDispose(() => window.removeEventListener('beforeunload', disconnect));
  }
  onScopeDispose(disconnect);

  return { connect, disconnect };
}
