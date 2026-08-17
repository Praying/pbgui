import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
  type QueueWsController,
  WS_RECONNECT_INITIAL_MS,
  WS_RECONNECT_MAX_MS,
  applyWsSettings,
  detectJustCompleted,
  hashQueueItems,
  parseQueueMessage,
  useQueueWs,
  type QueueWsOptions,
} from './useQueueWs';
import type { BacktestSettings, QueueItem } from '../types';

/*
 * The backtest queue WebSocket (v7_backtest.html:1267-1337) — risk R4.
 * Ported semantics under test:
 *   - queue_update JSON-hash diffing skips identical payloads (:1277-1295)
 *   - just-completed detection reloads configs/results exactly once (:1279-1293)
 *   - settings merge with the legacy 'True'|true vocabulary (:1296-1303)
 *   - reconnect backoff 1 s → 30 s, reset on open (:1324-1331)
 *   - client-pull wsRefresh message (:1333-1337)
 *   - archive_update delegation (:1308-1317)
 */

let queue: QueueItem[] = [];
let onQueueUpdate: ReturnType<typeof vi.fn>;
let onJustCompleted: ReturnType<typeof vi.fn>;
let onArchiveUpdate: ReturnType<typeof vi.fn>;
let onBanner: ReturnType<typeof vi.fn>;
let onSettings: ReturnType<typeof vi.fn>;
let currentPanel: string;
let sockets: FakeSocket[];
let timers: { now: number; ids: Map<number, () => void>; nextId: number };
let replacedUrls: string[];

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    sockets.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = FakeSocket.CLOSED;
  }
  /* test drivers */
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  message(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  closeEvent(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

function makeSettings(): BacktestSettings {
  return {
    autostart: false,
    cpu: 1,
    cpu_max: null,
    hsl_signal_modes: [],
    exchange_options: [],
    use_pbgui_market_data: false,
    hlcvs_cleanup_enabled: false,
    hlcvs_cleanup_days: 7,
    hlcvs_cleanup_interval_h: 24,
  };
}

function options(): QueueWsOptions {
  return {
    url: 'ws://h:8000/api/backtest-v7/ws/bt7',
    getCurrentPanel: () => currentPanel,
    onQueueUpdate: (items) => {
      queue = items;
      onQueueUpdate(items);
    },
    onJustCompleted,
    onArchiveUpdate,
    onBanner,
    onSettings,
    wsFactory: (url) => new FakeSocket(url) as never,
    timers: {
      setTimeout: (fn: () => void) => {
        const id = timers.nextId++;
        timers.ids.set(id, fn);
        return id;
      },
      clearTimeout: (id: number) => {
        timers.ids.delete(id);
      },
    } as never,
    bindBeforeUnload: false,
  };
}

function makeWs() {
  return useQueueWs(options());
}

function fireTimers(): void {
  const pending = [...timers.ids.values()];
  timers.ids.clear();
  pending.forEach((fn) => fn());
}

beforeEach(() => {
  queue = [];
  onQueueUpdate = vi.fn();
  onJustCompleted = vi.fn();
  onArchiveUpdate = vi.fn();
  onBanner = vi.fn();
  onSettings = vi.fn();
  currentPanel = 'configs';
  sockets = [];
  timers = { now: 0, ids: new Map(), nextId: 1 };
  replacedUrls = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  globalThis.history.replaceState = ((_data: unknown, _unused: unknown, url?: string) => {
    replacedUrls.push(String(url));
  }) as never;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseQueueMessage (:1272-1317)', () => {
  it('parses queue_update with items and optional settings', () => {
    const msg = parseQueueMessage(JSON.stringify({ type: 'queue_update', items: [{ filename: 'a' }], settings: { cpu: '2' } }));
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe('queue_update');
    if (msg?.type === 'queue_update') {
      expect(msg.items).toEqual([{ filename: 'a' }]);
      expect(msg.settings).toEqual({ cpu: '2' });
    }
  });

  it('parses archive_update', () => {
    expect(parseQueueMessage(JSON.stringify({ type: 'archive_update' }))?.type).toBe('archive_update');
  });

  it('missing items default to an empty array (:1276)', () => {
    const msg = parseQueueMessage(JSON.stringify({ type: 'queue_update' }));
    expect(msg?.type === 'queue_update' && msg.items).toEqual([]);
  });

  it('returns null for junk, non-JSON and unknown types (:1318)', () => {
    expect(parseQueueMessage('not json')).toBeNull();
    expect(parseQueueMessage(JSON.stringify({ type: 'other' }))).toBeNull();
    expect(parseQueueMessage(JSON.stringify([1, 2]))).toBeNull();
  });
});

describe('hashQueueItems / detectJustCompleted (:1277-1296)', () => {
  it('the hash is the legacy JSON.stringify of the items array (:1277)', () => {
    const items: QueueItem[] = [{ filename: 'a', status: 'running' }];
    expect(hashQueueItems(items)).toBe(JSON.stringify(items));
  });

  it('running → complete on the same filename counts as just completed', () => {
    const prev: QueueItem[] = [{ filename: 'a', status: 'running' }];
    const next: QueueItem[] = [{ filename: 'a', status: 'complete' }];
    expect(detectJustCompleted(prev, next)).toBe(true);
  });

  it('backtesting counts as running for the comparison (:1282-1283)', () => {
    expect(detectJustCompleted([{ filename: 'a', status: 'backtesting' }], [{ filename: 'a', status: 'complete' }])).toBe(true);
  });

  it('fresh completions (not previously running) do not trigger', () => {
    expect(detectJustCompleted([{ filename: 'a', status: 'queued' }], [{ filename: 'a', status: 'complete' }])).toBe(false);
    expect(detectJustCompleted([], [{ filename: 'a', status: 'complete' }])).toBe(false);
  });

  it('still-running jobs do not trigger', () => {
    expect(detectJustCompleted([{ filename: 'a', status: 'running' }], [{ filename: 'a', status: 'running' }])).toBe(false);
  });
});

describe('applyWsSettings (:1296-1303)', () => {
  it("accepts the boolean and the legacy 'True' string spellings", () => {
    const settings = applyWsSettings(makeSettings(), { autostart: 'True', use_pbgui_market_data: true });
    expect(settings.autostart).toBe(true);
    expect(settings.use_pbgui_market_data).toBe(true);
  });

  it("the lowercase 'true' string is NOT accepted (exact legacy check)", () => {
    const settings = applyWsSettings(makeSettings(), { autostart: 'true' as never });
    expect(settings.autostart).toBe(false);
  });

  it('parses numbers with the legacy || fallbacks (:1298-1302)', () => {
    const settings = applyWsSettings(makeSettings(), { cpu: 4, hlcvs_cleanup_days: '30', hlcvs_cleanup_interval_h: '12' });
    expect(settings.cpu).toBe(4);
    expect(settings.hlcvs_cleanup_days).toBe(30);
    expect(settings.hlcvs_cleanup_interval_h).toBe(12);
  });

  it('junk numbers fall back to 1/7/24 (:1298-1302)', () => {
    const settings = applyWsSettings(makeSettings(), { cpu: 'x' as never, hlcvs_cleanup_days: null, hlcvs_cleanup_interval_h: undefined });
    expect(settings.cpu).toBe(1);
    expect(settings.hlcvs_cleanup_days).toBe(7);
    expect(settings.hlcvs_cleanup_interval_h).toBe(24);
  });

  it('returns a new object — the input is never mutated', () => {
    const before = makeSettings();
    applyWsSettings(before, { cpu: 8 });
    expect(before.cpu).toBe(1);
  });

  it('absent fields reset to the legacy fallbacks — the server always sends the full object', () => {
    // legacy assigns every field unconditionally (:1297-1302): a partial
    // push would clobber cpu back to 1. Exact parity, quirk preserved.
    const settings = applyWsSettings({ ...makeSettings(), cpu: 6 }, { autostart: true });
    expect(settings.cpu).toBe(1);
    expect(settings.autostart).toBe(true);
  });
});

describe('useQueueWs runtime', () => {
  it('connects once and reports the ok banner (:1271)', () => {
    const ws = makeWs();
    ws.connect();
    ws.connect(); // second call is a no-op while connecting (:1268)
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    expect(onBanner).toHaveBeenCalledWith('ok');
    ws.disconnect();
  });

  it('identical queue payloads render exactly once (hash skip, :1277-1295)', async () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    const items: QueueItem[] = [{ filename: 'a', status: 'queued' }];
    socket.message({ type: 'queue_update', items });
    socket.message({ type: 'queue_update', items });
    socket.message({ type: 'queue_update', items });
    await nextTick();
    expect(onQueueUpdate).toHaveBeenCalledTimes(1);
    expect(queue).toEqual(items);
    ws.disconnect();
  });

  it('a changed payload re-renders', async () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    socket.message({ type: 'queue_update', items: [{ filename: 'a', status: 'queued' }] });
    socket.message({ type: 'queue_update', items: [{ filename: 'a', status: 'running' }] });
    await nextTick();
    expect(onQueueUpdate).toHaveBeenCalledTimes(2);
    ws.disconnect();
  });

  it('just-completed fires the side effect once per change (:1285-1293)', async () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    socket.message({ type: 'queue_update', items: [{ filename: 'a', status: 'running' }] });
    socket.message({ type: 'queue_update', items: [{ filename: 'a', status: 'complete' }] });
    socket.message({ type: 'queue_update', items: [{ filename: 'a', status: 'complete' }] }); // same hash → skipped
    await nextTick();
    expect(onJustCompleted).toHaveBeenCalledTimes(1);
    ws.disconnect();
  });

  it('just-completed is checked against the previous WS state, not the initial empty hash', async () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    // first message already complete: nothing was running before → no side effect
    socket.message({ type: 'queue_update', items: [{ filename: 'a', status: 'complete' }] });
    await nextTick();
    expect(onJustCompleted).not.toHaveBeenCalled();
    ws.disconnect();
  });

  it('settings arrive even when the queue hash is unchanged (:1296)', async () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    const items: QueueItem[] = [{ filename: 'a', status: 'complete' }];
    socket.message({ type: 'queue_update', items, settings: { cpu: 3 } });
    socket.message({ type: 'queue_update', items, settings: { cpu: 5 } });
    await nextTick();
    expect(onQueueUpdate).toHaveBeenCalledTimes(1);
    expect(onSettings).toHaveBeenCalledTimes(2);
    ws.disconnect();
  });

  it('archive_update delegates with the current panel (:1308-1317)', () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    currentPanel = 'archive';
    socket.message({ type: 'archive_update' });
    currentPanel = 'configs';
    socket.message({ type: 'archive_update' });
    expect(onArchiveUpdate).toHaveBeenCalledTimes(2);
    expect(onArchiveUpdate).toHaveBeenNthCalledWith(1, 'archive');
    expect(onArchiveUpdate).toHaveBeenNthCalledWith(2, 'configs');
    ws.disconnect();
  });

  it('non-JSON messages are swallowed (:1318)', () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    expect(() => socket.onmessage?.({ data: '{oops' })).not.toThrow();
    expect(onQueueUpdate).not.toHaveBeenCalled();
    ws.disconnect();
  });

  it('close → lost banner → reconnect after the backoff delay (:1320, :1324-1331)', () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    socket.closeEvent();
    expect(onBanner).toHaveBeenCalledWith('lost');
    // first reconnect waits 1 s
    expect(timers.ids.size).toBe(1);
    fireTimers();
    expect(sockets).toHaveLength(2);
    ws.disconnect();
  });

  it('the backoff doubles per failed attempt and caps at 30 s (:1329)', () => {
    const ws = makeWs() as QueueWsController & { reconnectDelayMs(): number };
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    expect(ws.reconnectDelayMs()).toBe(WS_RECONNECT_INITIAL_MS);
    socket.closeEvent(); // schedules reconnect after 1 s
    expect(ws.reconnectDelayMs()).toBe(WS_RECONNECT_INITIAL_MS); // doubling happens in the timer
    fireTimers(); // attempt #2 + delay → 2 s
    expect(ws.reconnectDelayMs()).toBe(2000);
    sockets[1]!.closeEvent();
    fireTimers(); // attempt #3 + delay → 4 s
    expect(ws.reconnectDelayMs()).toBe(4000);
    let last = sockets[sockets.length - 1]!;
    for (let i = 0; i < 10; i++) {
      last = sockets[sockets.length - 1]!;
      last.closeEvent();
      fireTimers();
    }
    expect(ws.reconnectDelayMs()).toBe(WS_RECONNECT_MAX_MS);
    ws.disconnect();
  });

  it('a successful open resets the backoff to 1 s (:1271)', () => {
    const ws = makeWs() as QueueWsController & { reconnectDelayMs(): number };
    ws.connect();
    sockets[0]!.closeEvent(); // failed attempt #1 → 2 s
    fireTimers();
    expect(ws.reconnectDelayMs()).toBe(2000);
    sockets[1]!.open();
    expect(ws.reconnectDelayMs()).toBe(WS_RECONNECT_INITIAL_MS);
    ws.disconnect();
  });

  it('only one reconnect timer is ever pending (:1325-1326)', () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    socket.closeEvent();
    socket.closeEvent(); // second close while already scheduled
    expect(timers.ids.size).toBe(1);
    ws.disconnect();
  });

  it('wsRefresh sends the client-pull message only while open (:1333-1337)', () => {
    const ws = makeWs();
    ws.connect();
    ws.wsRefresh(); // still CONNECTING → no send
    const socket = sockets[0]!;
    socket.open();
    ws.wsRefresh();
    expect(socket.sent).toEqual([JSON.stringify({ type: 'refresh' })]);
    socket.closeEvent();
    fireTimers();
    ws.wsRefresh(); // new socket connecting → no send
    expect(sockets[1]!.sent).toEqual([]);
    ws.disconnect();
  });

  it('disconnect detaches handlers and cancels the pending reconnect', () => {
    const ws = makeWs();
    ws.connect();
    const socket = sockets[0]!;
    socket.open();
    socket.closeEvent();
    expect(timers.ids.size).toBe(1);
    ws.disconnect();
    expect(timers.ids.size).toBe(0);
    expect(socket.onmessage).toBeNull();
    socket.message({ type: 'queue_update', items: [{ filename: 'a' }] });
    expect(onQueueUpdate).not.toHaveBeenCalled();
  });
});
