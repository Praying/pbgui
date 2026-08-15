import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import LogViewer from './LogViewer.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

/**
 * Minimal WebSocket double - the component only assigns the on* handlers,
 * reads url/readyState and calls send/close, so instances are driven manually.
 */
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
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

let replaceMock: ReturnType<typeof vi.fn>;

function mountViewer(file = 'PBRun.log') {
  return mount(LogViewer, {
    props: { file },
    global: { plugins: [createI18n('en')] },
  });
}

function openSocket(ws: FakeWebSocket): void {
  ws.onopen?.();
}

function pushMessage(ws: FakeWebSocket, msg: unknown): void {
  ws.onmessage?.({ data: JSON.stringify(msg) });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  replaceMock = vi.fn();
  vi.stubGlobal('location', { replace: replaceMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('LogViewer connection lifecycle (legacy log_viewer_panel.js)', () => {
  it('connects to the legacy /ws/vps endpoint and subscribes on open', () => {
    mountViewer('PBRun.log');

    expect(FakeWebSocket.instances).toHaveLength(1);
    // Legacy _connect(): url = wsBase + '/ws/vps' - token is never on the URL.
    expect(FakeWebSocket.instances[0]!.url).toBe('ws://pbgui.test:8000/ws/vps');

    openSocket(FakeWebSocket.instances[0]!);
    const sent = FakeWebSocket.instances[0]!.sentObjs();
    // Legacy onopen: list_local_logs first, then the local-file subscription.
    expect(sent[0]).toEqual({ cmd: 'list_local_logs' });
    expect(sent[1]).toEqual({
      cmd: 'subscribe_local_logs',
      file: 'PBRun.log',
      lines: 200,
      sid: 1,
      start_at_end: false,
    });
  });

  it('re-subscribes when the file prop changes (legacy setFile -> _subscribe)', async () => {
    const wrapper = mountViewer('PBRun.log');
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    await wrapper.setProps({ file: 'PBCluster.log' });

    const sent = ws.sentObjs();
    expect(sent.at(-2)).toEqual({ cmd: 'unsubscribe_local_logs' });
    expect(sent.at(-1)).toEqual({
      cmd: 'subscribe_local_logs',
      file: 'PBCluster.log',
      lines: 200,
      sid: 2,
      start_at_end: false,
    });
  });

  it('reconnects two seconds after an unexpected close', () => {
    vi.useFakeTimers();
    mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    ws.readyState = 3;
    ws.onclose?.({ code: 1006 });
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]!.url).toBe('ws://pbgui.test:8000/ws/vps');
  });

  it('marks the session expired and redirects on close code 4001 (legacy auth flow)', async () => {
    vi.useFakeTimers();
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    ws.readyState = 3;
    ws.onclose?.({ code: 4001 });
    await wrapper.vm.$nextTick();

    expect(replaceMock).toHaveBeenCalledWith('/');
    expect(wrapper.find('.lvp-conn-badge').text()).toBe('session expired');

    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1); // no reconnect after expiry
  });

  it('does not reconnect after unmount', () => {
    vi.useFakeTimers();
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    wrapper.unmount();
    expect(ws.closed).toBe(true);

    ws.readyState = 3;
    ws.onclose?.({ code: 1000 });
    vi.advanceTimersByTime(10_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('LogViewer line rendering (legacy _extractLevel/_levelClass)', () => {
  function renderedLines(wrapper: ReturnType<typeof mountViewer>) {
    return wrapper.findAll('.lvp-terminal > div');
  }

  it('renders local_logs with legacy level classes and strips ANSI codes', async () => {
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      streaming: true,
      lines: [
        '2026-01-01 10:00:00 [INFO] started',
        'fatal: could not bind port',
        '[31m[ERROR][0m disk full',
        'plain line without a marker',
      ],
    });
    await wrapper.vm.$nextTick();

    const lines = renderedLines(wrapper);
    expect(lines).toHaveLength(4);
    expect(lines[0]!.classes()).toContain('lvp-log-info');
    expect(lines[1]!.classes()).toContain('lvp-log-error');
    expect(lines[2]!.classes()).toContain('lvp-log-error');
    expect(lines[2]!.text()).toBe('[ERROR] disk full'); // ANSI stripped for display
    expect(lines[3]!.classes()).toContain('lvp-log-info');
    expect(lines[3]!.text()).toBe('plain line without a marker');
  });

  it('classifies WARNING and CRITICAL markers like the legacy regexes', async () => {
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      lines: ['[WARNING]: disk usage high', '[CRITICAL] master gone', 'changed: [host1]'],
    });
    await wrapper.vm.$nextTick();

    const lines = renderedLines(wrapper);
    expect(lines[0]!.classes()).toContain('lvp-log-warning');
    expect(lines[1]!.classes()).toContain('lvp-log-critical');
    expect(lines[2]!.classes()).toContain('lvp-log-warning');
  });

  it('appends local_log_lines and caps the buffer at the legacy 5000 lines', async () => {
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['first'] });
    pushMessage(ws, { type: 'local_log_lines', sid: 1, lines: Array.from({ length: 5004 }, (_, i) => `line-${i + 2}`) });
    await wrapper.vm.$nextTick();

    const lines = renderedLines(wrapper);
    expect(lines).toHaveLength(5000);
    expect(lines[0]!.text()).toBe('line-6'); // oldest trimmed
    expect(lines.at(-1)!.text()).toBe('line-5005');
  });

  it('ignores messages that carry a stale sid', async () => {
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['fresh'] });
    pushMessage(ws, { type: 'local_log_lines', sid: 0, lines: ['stale'] });
    await wrapper.vm.$nextTick();

    expect(renderedLines(wrapper).map((l) => l.text())).toEqual(['fresh']);
  });
});

describe('LogViewer controls (legacy toolbar)', () => {
  it('pause stops the stream and stream re-subscribes (legacy _toggleStream)', async () => {
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    const streamBtn = wrapper.find('.lvp-stream-btn');
    await wrapper.vm.$nextTick();
    expect(streamBtn.text()).toContain('Pause');

    await streamBtn.trigger('click');
    expect(ws.sentObjs().at(-1)).toEqual({ cmd: 'unsubscribe_local_logs' });
    expect(wrapper.find('.lvp-stream-btn').text()).toContain('Stream');

    await wrapper.find('.lvp-stream-btn').trigger('click');
    const last = ws.sentObjs().at(-1)!;
    expect(last).toMatchObject({ cmd: 'subscribe_local_logs', sid: 2 });
  });

  it('clear empties the terminal (legacy clear button)', async () => {
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['a', 'b'] });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.lvp-terminal > div')).toHaveLength(2);

    await wrapper.find('.lvp-clear-btn').trigger('click');
    expect(wrapper.findAll('.lvp-terminal > div')).toHaveLength(0);
  });

  it('toggles level visibility with the DBG/INF/WRN/ERR/CRT buttons', async () => {
    const wrapper = mountViewer();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['[INFO] keep', '[ERROR] drop me'] });
    await wrapper.vm.$nextTick();

    await wrapper.find('.lvp-lvl-btn[data-lvl="ERROR"]').trigger('click');
    const lines = wrapper.findAll('.lvp-terminal > div');
    expect(lines[0]!.classes()).not.toContain('lvp-level-hidden');
    expect(lines[1]!.classes()).toContain('lvp-level-hidden');

    await wrapper.find('.lvp-lvl-btn[data-lvl="ERROR"]').trigger('click');
    expect(wrapper.findAll('.lvp-terminal > div')[1]!.classes()).not.toContain('lvp-level-hidden');
  });
});
