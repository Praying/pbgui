import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useLogStream, type LogStreamController } from './useLogStream';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  sentObjs(): Array<Record<string, unknown>> {
    return this.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
  }
}

let replaceMock: ReturnType<typeof vi.fn>;

interface Harness {
  controller: LogStreamController;
  active: { value: boolean };
  unmount: () => void;
}

function makeHarness(defaultFile = 'PBGui.log'): Harness {
  let controller!: LogStreamController;
  const active = ref(true);
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useLogStream({
          active: () => active.value,
          wsBase: () => 'ws://test',
          defaultFile,
          lines: () => 200,
        });
        return () => h('div');
      },
    })
  );
  return { controller, active, unmount: () => wrapper.unmount() };
}

function openSocket(): FakeWebSocket {
  const ws = FakeWebSocket.instances[0]!;
  ws.onopen?.();
  return ws;
}

function push(ws: FakeWebSocket, message: unknown): void {
  ws.onmessage?.({ data: JSON.stringify(message) });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  replaceMock = vi.fn();
  vi.stubGlobal('location', { replace: replaceMock, href: 'http://test/' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLogStream', () => {
  it('requests the file list and subscribes with the default file on open', () => {
    makeHarness();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = openSocket();

    expect(ws.sentObjs()[0]).toEqual({ cmd: 'list_local_logs' });
    expect(ws.sentObjs()[1]).toEqual({
      cmd: 'subscribe_local_logs',
      file: 'PBGui.log',
      lines: 200,
      sid: 1,
      start_at_end: false,
    });
  });

  it('stores the WS file list from the local_logs_list reply', () => {
    const { controller } = makeHarness();
    const ws = openSocket();

    push(ws, { type: 'local_logs_list', files: ['PBGui.log', 'PBRun.log'] });
    expect(controller.serverFiles.value).toEqual(['PBGui.log', 'PBRun.log']);
  });

  it('replaces the buffer on local_logs and appends on local_log_lines', () => {
    const { controller } = makeHarness();
    const ws = openSocket();

    push(ws, { type: 'local_logs', sid: 1, streaming: true, lines: ['first'] });
    expect(controller.lines.value).toEqual(['first']);
    expect(controller.streaming.value).toBe(true);

    push(ws, { type: 'local_log_lines', sid: 1, lines: ['second', 'third'] });
    expect(controller.lines.value).toEqual(['first', 'second', 'third']);
  });

  it('ignores frames from a stale session id', () => {
    const { controller } = makeHarness();
    const ws = openSocket();

    push(ws, { type: 'local_logs', sid: 99, lines: ['stale'] });
    expect(controller.lines.value).toEqual([]);
  });

  it('resubscribes when the target file changes and one-shot fetches a rotated variant', () => {
    const { controller } = makeHarness();
    const ws = openSocket();

    controller.setFile('PBRun.log');
    expect(ws.sentObjs()).toContainEqual({
      cmd: 'subscribe_local_logs',
      file: 'PBRun.log',
      lines: 200,
      sid: 2,
      start_at_end: false,
    });

    controller.fetchFile('PBRun.log.1');
    expect(ws.sentObjs()).toContainEqual({
      cmd: 'get_local_logs',
      file: 'PBRun.log.1',
      lines: 200,
      sid: 3,
    });
    expect(controller.streaming.value).toBe(false);

    // Returning to the streamed target resubscribes even though it is unchanged.
    controller.setFile('PBRun.log');
    const last = ws.sentObjs().at(-1);
    expect(last).toMatchObject({ cmd: 'subscribe_local_logs', file: 'PBRun.log' });
  });

  it('derives the restart command from the log file name', () => {
    const { controller } = makeHarness('PBRun.log');
    const ws = openSocket();

    controller.restart();
    expect(ws.sentObjs()).toContainEqual({ cmd: 'restart_service', host: 'local', service: 'PBRun' });
    expect(controller.restartState.value).toBe('restarting');

    push(ws, { cmd: 'restart_service', success: true });
    expect(controller.restartState.value).toBe('restarted');
  });

  it('restarts a bot instance with kill_instance when the file follows the bot naming', () => {
    const { controller } = makeHarness('my_bot.log');
    const ws = openSocket();

    controller.restart();
    expect(ws.sentObjs()).toContainEqual({
      cmd: 'kill_instance',
      host: 'local',
      name: 'my_bot',
      pb_version: '7',
    });
  });

  it('treats close code 4001 as terminal session expiry and redirects', () => {
    const { controller } = makeHarness();
    const ws = openSocket();

    ws.onclose?.({ code: 4001 });
    expect(replaceMock).toHaveBeenCalledWith('/');
    expect(controller.connectionIssue.value).toBe('session-expired');
    expect(controller.connectionStatus.value).toBe('disconnected');
  });

  it('disconnects while inactive and reconnects when the host becomes active again', async () => {
    const { controller, active, unmount } = makeHarness();
    const first = openSocket();

    active.value = false;
    await nextTick();
    expect(first.closed).toBe(true);
    expect(controller.streaming.value).toBe(false);

    active.value = true;
    await nextTick();
    expect(FakeWebSocket.instances).toHaveLength(2);
    unmount();
  });
});
