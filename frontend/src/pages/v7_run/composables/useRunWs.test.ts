import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WS_AUTH_CLOSED_CODE, parseInstancesMessage, useRunWs, type WebSocketLike } from './useRunWs';

/* The connectWS contract (v7_run.html:611-662): generation-guarded
   handlers, 'instances' message dispatch, close-4001 no-reconnect, and the
   exponential 1 s → 30 s back-off reset on open. */

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;
  /* Annotated: WebSocket.CONNECTING is the literal type 0, which would
     narrow the field and reject OPEN/CLOSED assignments below. */
  readyState: number = WebSocket.CONNECTING;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.onopen?.({});
  }

  message(data: unknown): void {
    this.onmessage?.({ data });
  }

  closeWith(code?: number): void {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code });
  }

  error(): void {
    this.onerror?.({});
  }
}

function makeController(overrides: Partial<Parameters<typeof useRunWs>[0]> = {}) {
  const onInstances = vi.fn();
  const onBanner = vi.fn();
  const timers = {
    setTimeout: vi.fn(setTimeout) as unknown as typeof setTimeout,
    clearTimeout: vi.fn(clearTimeout) as unknown as typeof clearTimeout,
  };
  const controller = useRunWs({
    url: 'ws://pbgui.test/api/v7/ws/v7',
    onInstances,
    onBanner,
    wsFactory: (url) => new FakeSocket(url),
    timers,
    bindBeforeUnload: false,
    ...overrides,
  });
  return { controller, onInstances, onBanner, timers };
}

beforeEach(() => {
  FakeSocket.instances = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseInstancesMessage (:629-639)', () => {
  it('accepts {"type":"instances","data":[...]}', () => {
    expect(parseInstancesMessage('{"type":"instances","data":[{"name":"a"}]}')).toEqual([{ name: 'a' }]);
  });

  it('rejects other types, non-arrays and broken JSON', () => {
    expect(parseInstancesMessage('{"type":"other","data":[]}')).toBeNull();
    expect(parseInstancesMessage('{"type":"instances","data":{"name":"a"}}')).toBeNull();
    expect(parseInstancesMessage('not json')).toBeNull();
  });
});

describe('useRunWs', () => {
  it('connects once and resets the back-off on open (:623-627)', () => {
    const { controller } = makeController();
    controller.connect(); // second connect while OPEN/CONNECTING is ignored (:617)
    controller.connect();

    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0]!.url).toBe('ws://pbgui.test/api/v7/ws/v7');
    FakeSocket.instances[0]!.open();
    expect(FakeSocket.instances[0]!.closed).toBe(false);
  });

  it('dispatches instances messages to the handler (:633-637)', () => {
    const { controller, onInstances, onBanner } = makeController();
    controller.connect();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.message('{"type":"instances","data":[]}');
    socket.message('{"type":"noise"}');

    expect(onInstances).toHaveBeenCalledTimes(1);
    expect(onInstances).toHaveBeenCalledWith([]);
    expect(onBanner).toHaveBeenCalledWith('ok');
  });

  it('reconnects with doubling delay capped at 30 s (:655-662)', () => {
    const { controller, timers } = makeController();
    controller.connect();
    const socket = FakeSocket.instances[0]!;
    socket.closeWith(1006);

    // close → banner lost + schedule at 1 s
    expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    const fire = () =>
      ((timers.setTimeout as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [() => void, number])[0]!();

    fire(); // reconnect #2 → delay doubles to 2 s
    FakeSocket.instances[1]!.closeWith(1006);
    expect(timers.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000);

    fire(); // reconnect #3
    FakeSocket.instances[2]!.open();
    FakeSocket.instances[2]!.closeWith(1006);
    expect(timers.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000); // reset on open (:625)
  });

  it('never reconnects after close 4001 (auth) (:645)', () => {
    const { controller, timers, onBanner } = makeController();
    controller.connect();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.closeWith(WS_AUTH_CLOSED_CODE);

    expect(onBanner).toHaveBeenCalledWith('lost');
    expect(timers.setTimeout).not.toHaveBeenCalled();
  });

  it('marks the banner lost on error (:649-652)', () => {
    const { controller, onBanner } = makeController();
    controller.connect();
    FakeSocket.instances[0]!.error();

    expect(onBanner).toHaveBeenCalledWith('lost');
  });

  it('a stale generation socket is ignored (:618-652)', () => {
    const { controller, onInstances, onBanner } = makeController();
    controller.connect();
    const stale = FakeSocket.instances[0]!;
    controller.disconnect();
    controller.connect();
    const fresh = FakeSocket.instances[1]!;

    stale.open(); // late open of the replaced socket
    stale.message('{"type":"instances","data":[]}');
    expect(onInstances).not.toHaveBeenCalled();
    expect(stale.closed).toBe(true); // generation guard closes it (:624-626)

    fresh.open();
    expect(onBanner).toHaveBeenCalledWith('ok');
  });

  it('disconnect clears the reconnect timer and detaches handlers (:1454-1458)', () => {
    const { controller, timers } = makeController();
    controller.connect();
    FakeSocket.instances[0]!.closeWith(1006);
    controller.disconnect();

    expect(timers.clearTimeout).toHaveBeenCalled();
    const socket = FakeSocket.instances[0]!;
    expect(socket.closed).toBe(true);
    socket.closeWith(1006); // detached — must not schedule anything
    expect((timers.setTimeout as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1); // only the first schedule
  });
});
