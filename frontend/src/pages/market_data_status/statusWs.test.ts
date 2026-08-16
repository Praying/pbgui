import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECONNECT_MAX_MS, RECONNECT_BASE_MS, reconnectDelayMs, useStatusWs } from './statusWs';
import type { MarketDataStatus, WsStatusMessage } from './types';

/** Fake socket capturing handler wiring like dashboard_editor's App tests. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.onopen?.({});
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }

  closeEvent(): void {
    this.onclose?.({});
  }
}

function statusFixture(overrides: Partial<MarketDataStatus> = {}): WsStatusMessage {
  return {
    type: 'market_data_status',
    running: false,
    queued: false,
    coins_done: 0,
    coins_total: 0,
    current_coin: '',
    coin_rows: [],
    ...overrides,
  };
}

const WS_URL = 'ws://pbgui.test:8000/ws/market-data?exchange=binance';

function makeWs(url: string = WS_URL) {
  return useStatusWs({ url, wsFactory: (u) => new FakeWebSocket(u) });
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reconnectDelayMs (legacy min(1000 * 2^attempts, 30000))', () => {
  it('starts at 2s for the first retry and doubles', () => {
    expect(reconnectDelayMs(1)).toBe(2000);
    expect(reconnectDelayMs(2)).toBe(4000);
    expect(reconnectDelayMs(3)).toBe(8000);
  });

  it('caps at 30 seconds', () => {
    expect(reconnectDelayMs(6)).toBe(RECONNECT_MAX_MS);
    expect(reconnectDelayMs(20)).toBe(RECONNECT_MAX_MS);
    expect(RECONNECT_BASE_MS).toBe(1000);
  });
});

describe('useStatusWs connection lifecycle', () => {
  it('connects on creation to the exchange-scoped URL', () => {
    makeWs('ws://pbgui.test:8000/ws/market-data?exchange=bybit');

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toBe('ws://pbgui.test:8000/ws/market-data?exchange=bybit');
  });

  it('stores nothing before a market_data_status message arrives', () => {
    const ws = makeWs();

    expect(ws.status.value).toBeNull();
  });

  it('updates the status ref on a market_data_status message', () => {
    const ws = makeWs();

    FakeWebSocket.instances[0]!.message(JSON.stringify(statusFixture({ running: true, coins_total: 4, coins_done: 2 })));

    expect(ws.status.value?.running).toBe(true);
    expect(ws.status.value?.coins_total).toBe(4);
  });

  it('ignores messages carrying an error field (legacy early return)', () => {
    const ws = makeWs();

    FakeWebSocket.instances[0]!.message(JSON.stringify({ error: 'Unknown exchange: x' }));

    expect(ws.status.value).toBeNull();
  });

  it('ignores messages of other types', () => {
    const ws = makeWs();

    FakeWebSocket.instances[0]!.message(JSON.stringify({ type: 'something_else', running: true }));

    expect(ws.status.value).toBeNull();
  });

  it('swallows malformed JSON like a failed legacy parse', () => {
    const ws = makeWs();

    expect(() => FakeWebSocket.instances[0]!.message('{not json')).not.toThrow();
    expect(ws.status.value).toBeNull();
  });

  it('applies the legacy defaults for missing status fields', () => {
    const ws = makeWs();

    FakeWebSocket.instances[0]!.message(JSON.stringify({ type: 'market_data_status' }));

    expect(ws.status.value).toEqual({
      running: false,
      queued: false,
      coins_done: 0,
      coins_total: 0,
      current_coin: '',
      coin_rows: [],
    });
  });
});

describe('useStatusWs reconnect (legacy exponential backoff)', () => {
  it('reconnects after 2s, 4s, 8s and resets the counter on open', () => {
    makeWs();
    const sock = FakeWebSocket.instances[0]!;

    sock.closeEvent();
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    FakeWebSocket.instances[1]!.closeEvent();
    vi.advanceTimersByTime(3999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    FakeWebSocket.instances[2]!.open();
    FakeWebSocket.instances[2]!.closeEvent();
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('does not reconnect after disconnect', () => {
    const ws = makeWs();

    ws.disconnect();
    FakeWebSocket.instances[0]!.closeEvent();
    vi.advanceTimersByTime(60000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('useStatusWs disconnect (legacy destroyMonitor)', () => {
  it('closes the socket with handlers detached and clears pending reconnects', () => {
    const ws = makeWs();
    const sock = FakeWebSocket.instances[0]!;

    sock.closeEvent(); // schedules a reconnect
    ws.disconnect();

    expect(sock.closed).toBe(true);
    expect(sock.onopen).toBeNull();
    expect(sock.onmessage).toBeNull();
    expect(sock.onclose).toBeNull();
    expect(sock.onerror).toBeNull();

    vi.advanceTimersByTime(60000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
