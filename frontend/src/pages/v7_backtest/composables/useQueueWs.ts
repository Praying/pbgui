import { onScopeDispose, ref } from 'vue';
import type { BacktestSettings, QueueItem } from '../types';

/**
 * The backtest queue WebSocket (v7_backtest.html:1267-1337) — risk R4.
 * Ported semantics:
 *  - queue_update payloads are JSON-hash diffed; identical payloads skip
 *    the re-render (:1277-1295);
 *  - a job that just transitioned running/backtesting → complete fires
 *    the side-effect hook (configs + results reload) once per change
 *    (:1279-1293);
 *  - settings pushes merge through the legacy 'True'|true vocabulary
 *    (:1296-1303) even when the queue hash is unchanged;
 *  - reconnect backoff 1 s → 30 s doubles after each attempt and resets
 *    on open (:1324-1331);
 *  - the client sends {"type":"refresh"} to pull a fresh snapshot
 *    (:1333-1337);
 *  - archive_update messages delegate with the current panel
 *    (:1308-1317).
 */

export const WS_RECONNECT_INITIAL_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30000;

/** The subset of WebSocket the controller touches (tests fake this). */
export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
  send(data: string): void;
  readonly readyState: number;
}

export type BannerState = 'ok' | 'lost' | 'waiting';

export type QueueMessage =
  | { type: 'queue_update'; items: QueueItem[]; settings?: Record<string, unknown> }
  | { type: 'archive_update' };

export interface QueueWsOptions {
  url: string;
  getCurrentPanel(): string;
  /** Called only when the queue hash changed (:1304-1307). */
  onQueueUpdate?(items: QueueItem[]): void;
  /** The just-completed side effect (:1288-1292). */
  onJustCompleted?(): void;
  /** archive_update delegation (:1308-1317). */
  onArchiveUpdate?(currentPanel: string): void;
  onBanner?(state: BannerState): void;
  /** The merged settings fields (:1296-1303). */
  onSettings?(partial: Record<string, unknown>): void;
  wsFactory?: (url: string) => WebSocketLike;
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
  bindBeforeUnload?: boolean;
}

export interface QueueWsController {
  connect(): void;
  disconnect(): void;
  wsRefresh(): void;
  items: { value: QueueItem[] };
  /** Read-only view of the current backoff delay (test hook). */
  reconnectDelayMs(): number;
}

/** Parse one WS frame; junk is swallowed like the legacy try/catch (:1318). */
export function parseQueueMessage(raw: unknown): QueueMessage | null {
  try {
    const msg: unknown = JSON.parse(String(raw));
    if (typeof msg !== 'object' || msg === null) return null;
    const type = (msg as { type?: unknown }).type;
    if (type === 'queue_update') {
      const rawItems = (msg as { items?: unknown }).items;
      const items = Array.isArray(rawItems) ? (rawItems as QueueItem[]) : [];
      const settings = (msg as { settings?: unknown }).settings;
      return {
        type: 'queue_update',
        items,
        ...(settings && typeof settings === 'object' ? { settings: settings as Record<string, unknown> } : {}),
      };
    }
    if (type === 'archive_update') return { type: 'archive_update' };
    return null;
  } catch {
    return null;
  }
}

/** The legacy hash — plain JSON.stringify of the items array (:1277). */
export function hashQueueItems(items: QueueItem[]): string {
  return JSON.stringify(items);
}

/** running/backtesting → complete on a previously-running filename (:1281-1287). */
export function detectJustCompleted(prev: QueueItem[], next: QueueItem[]): boolean {
  const prevRunning = new Set(prev.filter((q) => q.status === 'running' || q.status === 'backtesting').map((q) => q.filename));
  return next.some((q) => q.status === 'complete' && prevRunning.has(q.filename));
}

function parseBool(value: unknown): boolean {
  return value === 'True' || value === true;
}

function parseIntOr(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The WS settings merge (:1296-1303) — immutable, exact legacy vocabulary. */
export function applyWsSettings(current: BacktestSettings, incoming: unknown): BacktestSettings {
  if (!incoming || typeof incoming !== 'object') return current;
  const raw = incoming as Record<string, unknown>;
  return {
    ...current,
    autostart: parseBool(raw.autostart),
    cpu: parseIntOr(raw.cpu, 1),
    use_pbgui_market_data: parseBool(raw.use_pbgui_market_data),
    hlcvs_cleanup_enabled: parseBool(raw.hlcvs_cleanup_enabled),
    hlcvs_cleanup_days: parseIntOr(raw.hlcvs_cleanup_days, 7),
    hlcvs_cleanup_interval_h: parseIntOr(raw.hlcvs_cleanup_interval_h, 24),
  };
}

export function useQueueWs(options: QueueWsOptions): QueueWsController {
  const wsFactory = options.wsFactory ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
  const timers = options.timers ?? { setTimeout, clearTimeout };

  const items = ref<QueueItem[]>([]);
  let ws: WebSocketLike | null = null;
  let socketGeneration = 0;
  let lastQueueHash = '';
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = WS_RECONNECT_INITIAL_MS;

  function scheduleReconnect(): void {
    if (reconnectTimer !== null) return; // :1325
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      connect();
      reconnectDelay = Math.min(reconnectDelay * 2, WS_RECONNECT_MAX_MS); // :1329
    }, reconnectDelay);
  }

  function handleQueueUpdate(msg: Extract<QueueMessage, { type: 'queue_update' }>): void {
    const newItems = msg.items;
    const newHash = hashQueueItems(newItems);
    const changed = newHash !== lastQueueHash;
    if (changed && detectJustCompleted(items.value, newItems)) {
      options.onJustCompleted?.();
    }
    lastQueueHash = newHash;
    items.value = newItems;
    if (msg.settings) options.onSettings?.(msg.settings);
    if (changed) options.onQueueUpdate?.(newItems);
  }

  function connect(): void {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return; // :1268
    const generation = ++socketGeneration;
    const socket = wsFactory(options.url);
    ws = socket;

    socket.onopen = () => {
      if (generation !== socketGeneration) {
        socket.close();
        return;
      }
      reconnectDelay = WS_RECONNECT_INITIAL_MS; // :1271
      options.onBanner?.('ok');
    };
    socket.onmessage = (ev) => {
      if (generation !== socketGeneration) return;
      const msg = parseQueueMessage(ev.data);
      if (!msg) return;
      if (msg.type === 'queue_update') handleQueueUpdate(msg);
      else if (msg.type === 'archive_update') options.onArchiveUpdate?.(options.getCurrentPanel());
    };
    socket.onclose = () => {
      if (generation !== socketGeneration) return;
      options.onBanner?.('lost');
      scheduleReconnect();
    };
    socket.onerror = () => {
      if (generation !== socketGeneration) return;
      options.onBanner?.('lost');
    };
  }

  function disconnect(): void {
    socketGeneration += 1;
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

  function wsRefresh(): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'refresh' }));
    }
  }

  if (options.bindBeforeUnload !== false && typeof window !== 'undefined') {
    window.addEventListener('beforeunload', disconnect);
    onScopeDispose(() => window.removeEventListener('beforeunload', disconnect));
  }
  onScopeDispose(disconnect);

  return {
    connect,
    disconnect,
    wsRefresh,
    items,
    reconnectDelayMs: () => reconnectDelay,
  };
}
