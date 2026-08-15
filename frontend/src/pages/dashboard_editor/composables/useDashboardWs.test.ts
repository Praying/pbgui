import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardWs, wsTypesForMessage } from './useDashboardWs';
import type { WebSocketLike, WsCellStore } from './useDashboardWs';
import { openMselDropdown, resetMselRegistry } from '../lib/mselRegistry';
import type { RenderableWidgetType } from '../lib/grid';

/* Port of the editor WS orchestration (dashboard_editor.html:2749-2826):
   /ws/dashboard with exponential reconnect 1 s→30 s, the income/balance/
   positions event → widget-type dispatch table, 300 ms rebuild debounce with
   pending-type merging, the `.msel-drop.open` guard, and the positions
   live-poll skip. */

class FakeWebSocket implements WebSocketLike {
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

  /** Convenience: deliver a server message frame. */
  emit(data: unknown): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}

function lastSocket(): FakeWebSocket {
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!ws) throw new Error('no WebSocket created');
  return ws;
}

/** Grid of 2×2 cells with fixed types; rebuildCell records 'r_c' calls. */
function makeStore(types: string[][]): WsCellStore & { rebuilds: string[] } {
  return {
    rows: types.length,
    cols: types[0]?.length ?? 0,
    cellType(row: number, col: number): string {
      return types[row - 1]?.[col - 1] ?? 'NONE';
    },
    rebuildCell(row: number, col: number): void {
      this.rebuilds.push(row + '_' + col);
    },
    rebuilds: [],
  };
}

const GRID = [
  ['INCOME', 'BALANCE'],
  ['P+L', 'TOP'],
];

beforeEach(() => {
  FakeWebSocket.instances = [];
  resetMselRegistry();
  vi.useFakeTimers();
  /* the default wsFactory is `new WebSocket(url)` — jsdom has no usable
     implementation, so the global is stubbed for every test */
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('wsTypesForMessage (editor:2797-2803 dispatch table)', () => {
  it('maps income_updated to INCOME/TOP/PNL/ADG/P+L', () => {
    expect(wsTypesForMessage({ type: 'income_updated' })).toEqual(['INCOME', 'TOP', 'PNL', 'ADG', 'P+L']);
  });

  it('maps balance_updated to BALANCE', () => {
    expect(wsTypesForMessage({ type: 'balance_updated' })).toEqual(['BALANCE']);
  });

  it('maps positions_updated to POSITIONS', () => {
    expect(wsTypesForMessage({ type: 'positions_updated' })).toEqual(['POSITIONS']);
  });

  it('returns null for unknown types and malformed payloads', () => {
    expect(wsTypesForMessage({ type: 'nope' })).toBeNull();
    expect(wsTypesForMessage({})).toBeNull();
    expect(wsTypesForMessage('income_updated')).toBeNull();
    expect(wsTypesForMessage(null)).toBeNull();
    expect(wsTypesForMessage(undefined)).toBeNull();
  });
});

describe('connection lifecycle (editor:2786-2823)', () => {
  it('connects to /ws/dashboard derived from the api base on creation', () => {
    useDashboardWs({ apiBase: 'http://pbgui.test:8000/api', store: makeStore(GRID) });
    expect(lastSocket().url).toBe('ws://pbgui.test:8000/ws/dashboard');
  });

  it('supports the relative api base (legacy empty API_BASE)', () => {
    useDashboardWs({ apiBase: '/api', store: makeStore(GRID) });
    expect(lastSocket().url).toBe('/ws/dashboard');
  });

  it('resets the reconnect delay on open', () => {
    const ctrl = useDashboardWs({ apiBase: '/api', store: makeStore(GRID) });
    const first = lastSocket();
    first.onclose?.(null);
    /* 1 s later: reconnect with delay 1000 */
    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    /* open resets; the next close reconnects after 1000, not 2000 */
    lastSocket().onopen?.(null);
    lastSocket().onclose?.(null);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    ctrl.disconnect();
  });

  it('doubles the reconnect delay up to the 30 s cap (editor:2819-2820)', () => {
    const ctrl = useDashboardWs({ apiBase: '/api', store: makeStore(GRID) });
    /* close without open: delays 1000, 2000, 4000, 8000, 16000 */
    let count = 1; // the initial connection
    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      lastSocket().onclose?.(null);
      vi.advanceTimersByTime(delay - 1);
      expect(FakeWebSocket.instances).toHaveLength(count);
      vi.advanceTimersByTime(1);
      count += 1;
      expect(FakeWebSocket.instances).toHaveLength(count);
    }
    /* next delay is capped at 30000, not 32000 */
    lastSocket().onclose?.(null);
    vi.advanceTimersByTime(29999);
    expect(FakeWebSocket.instances).toHaveLength(count);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(count + 1);
    ctrl.disconnect();
  });

  it('closes the socket on error (editor:2822)', () => {
    useDashboardWs({ apiBase: '/api', store: makeStore(GRID) });
    const ws = lastSocket();
    ws.onerror?.(null);
    expect(ws.closed).toBe(true);
  });

  it('disconnect clears timers and never reconnects (Vue lifecycle; legacy leaked)', () => {
    const ctrl = useDashboardWs({ apiBase: '/api', store: makeStore(GRID) });
    const ws = lastSocket();
    ctrl.disconnect();
    expect(ws.closed).toBe(true);
    ws.onclose?.(null); // close event after disconnect must not schedule a reconnect
    vi.advanceTimersByTime(60000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('rebuild dispatch (editor:2760-2815)', () => {
  it('rebuilds INCOME/TOP/PNL/ADG/P+L cells 300 ms after income_updated', () => {
    const store = makeStore(GRID);
    useDashboardWs({ apiBase: '/api', store });
    lastSocket().emit({ type: 'income_updated' });
    expect(store.rebuilds).toEqual([]);
    vi.advanceTimersByTime(299);
    expect(store.rebuilds).toEqual([]);
    vi.advanceTimersByTime(1);
    /* legacy loop order is row-major (editor:2764-2766): INCOME, P+L, TOP */
    expect(store.rebuilds).toEqual(['1_1', '2_1', '2_2']);
  });

  it('rebuilds only BALANCE cells on balance_updated', () => {
    const store = makeStore(GRID);
    useDashboardWs({ apiBase: '/api', store });
    lastSocket().emit({ type: 'balance_updated' });
    vi.advanceTimersByTime(300);
    expect(store.rebuilds).toEqual(['1_2']);
  });

  it('skips POSITIONS cells whose live poll is active (editor:2778-2781)', () => {
    const store = makeStore([['POSITIONS', 'BALANCE']]);
    const isPositionsLive = vi.fn((pos: string) => pos === '1_1');
    useDashboardWs({ apiBase: '/api', store, isPositionsLive });
    lastSocket().emit({ type: 'positions_updated' });
    vi.advanceTimersByTime(300);
    expect(isPositionsLive).toHaveBeenCalledWith('1_1');
    expect(store.rebuilds).toEqual([]);

    /* a positions cell without a live poll still rebuilds */
    const store2 = makeStore([['POSITIONS', 'BALANCE']]);
    useDashboardWs({ apiBase: '/api', store: store2, isPositionsLive: () => false });
    lastSocket().emit({ type: 'positions_updated' });
    vi.advanceTimersByTime(300);
    expect(store2.rebuilds).toEqual(['1_1']);
  });

  it('merges rapid events into one debounced rebuild (editor:2804-2814)', () => {
    const store = makeStore(GRID);
    useDashboardWs({ apiBase: '/api', store });
    const ws = lastSocket();
    ws.emit({ type: 'income_updated' });
    vi.advanceTimersByTime(100);
    ws.emit({ type: 'balance_updated' });
    /* 300 ms after the FIRST event: nothing (timer was reset by the second) */
    vi.advanceTimersByTime(200);
    expect(store.rebuilds).toEqual([]);
    /* 300 ms after the SECOND event: one merged rebuild, row-major */
    vi.advanceTimersByTime(100);
    expect(store.rebuilds).toEqual(['1_1', '1_2', '2_1', '2_2']);
  });

  it('dedupes repeated events of the same type (editor:2806-2808)', () => {
    const store = makeStore(GRID);
    useDashboardWs({ apiBase: '/api', store });
    const ws = lastSocket();
    ws.emit({ type: 'balance_updated' });
    vi.advanceTimersByTime(100);
    ws.emit({ type: 'balance_updated' });
    vi.advanceTimersByTime(300);
    expect(store.rebuilds).toEqual(['1_2']);
  });

  it('skips the rebuild while a multi-select dropdown is open (editor:2761)', () => {
    const store = makeStore(GRID);
    useDashboardWs({ apiBase: '/api', store }); // default guard: mselRegistry
    lastSocket().emit({ type: 'income_updated' });
    openMselDropdown(() => undefined);
    vi.advanceTimersByTime(300);
    expect(store.rebuilds).toEqual([]);
  });

  it('honours a custom isBlocked guard', () => {
    const store = makeStore(GRID);
    const isBlocked = vi.fn(() => true);
    useDashboardWs({ apiBase: '/api', store, isBlocked });
    lastSocket().emit({ type: 'income_updated' });
    vi.advanceTimersByTime(300);
    expect(isBlocked).toHaveBeenCalled();
    expect(store.rebuilds).toEqual([]);
  });

  it('ignores malformed JSON and unknown events without throwing (editor:2816)', () => {
    const store = makeStore(GRID);
    useDashboardWs({ apiBase: '/api', store });
    const ws = lastSocket();
    expect(() => ws.emit('not json')).not.toThrow();
    ws.emit({ type: 'something_else' });
    vi.advanceTimersByTime(300);
    expect(store.rebuilds).toEqual([]);
  });

  it('rebuildCellsOfTypes respects the guard and cell bounds directly', () => {
    const store = makeStore([['NONE']]);
    const ctrl = useDashboardWs({ apiBase: '/api', store });
    ctrl.rebuildCellsOfTypes(['INCOME'] as RenderableWidgetType[]);
    expect(store.rebuilds).toEqual([]);

    const store2 = makeStore([['INCOME', 'PNL']]);
    const ctrl2 = useDashboardWs({ apiBase: '/api', store: store2 });
    ctrl2.rebuildCellsOfTypes(['PNL'] as RenderableWidgetType[]);
    expect(store2.rebuilds).toEqual(['1_2']);
  });
});
