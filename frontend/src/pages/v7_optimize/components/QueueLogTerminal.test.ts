import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueueLogTerminal from './QueueLogTerminal.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

/** Minimal WebSocket double — the component only assigns handlers and sends. */
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

function mountTerminal(file = 'optimizes_v8/alpha.log') {
  return mount(QueueLogTerminal, {
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

function snapshotLines(wrapper: ReturnType<typeof mountTerminal>): string[] {
  return wrapper.findAll('[data-line]').map((row) => row.text());
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  replaceMock = vi.fn();
  vi.stubGlobal('location', { replace: replaceMock });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('QueueLogTerminal connection lifecycle (legacy log_viewer_panel.js)', () => {
  it('connects to /ws/vps and subscribes to the prefixed queue log', () => {
    mountTerminal('optimizes_v8/alpha.log');

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toBe('ws://pbgui.test:8000/ws/vps');

    openSocket(FakeWebSocket.instances[0]!);
    const sent = FakeWebSocket.instances[0]!.sentObjs();
    expect(sent[0]).toEqual({ cmd: 'list_local_logs' });
    expect(sent[1]).toEqual({
      cmd: 'subscribe_local_logs',
      file: 'optimizes_v8/alpha.log',
      lines: 200,
      sid: 1,
      start_at_end: false,
    });
  });

  it('resubscribes with a bumped sid when the file changes', async () => {
    const wrapper = mountTerminal('optimizes_v8/alpha.log');
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    await wrapper.setProps({ file: 'optimizes_v8/beta.log' });
    const sent = ws.sentObjs();
    const resubscribe = sent.at(-1);
    expect(resubscribe).toMatchObject({ cmd: 'subscribe_local_logs', file: 'optimizes_v8/beta.log', sid: 2 });
  });

  it('redirects on auth expiry (close code 4001) and does not reconnect', () => {
    const wrapper = mountTerminal();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    ws.onclose?.({ code: 4001 });
    expect(replaceMock).toHaveBeenCalledWith('/');
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('QueueLogTerminal rendering and filters', () => {
  it('renders the snapshot, appends lines and keeps the 5000-line cap', async () => {
    const wrapper = mountTerminal();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['[INFO] started', '[WARNING] slow disk', 'Traceback (most recent call last)'] });
    await flushPromises();
    expect(snapshotLines(wrapper)).toEqual(['[INFO] started', '[WARNING] slow disk', 'Traceback (most recent call last)']);

    pushMessage(ws, { type: 'local_log_lines', sid: 1, lines: ['[ERROR] boom'] });
    await flushPromises();
    expect(snapshotLines(wrapper)).toHaveLength(4);

    pushMessage(ws, { type: 'local_log_lines', sid: 1, lines: Array.from({ length: 6000 }, (_, i) => `line ${i}`) });
    await flushPromises();
    expect(snapshotLines(wrapper)).toHaveLength(5000);
    wrapper.unmount();
  });

  it('ignores messages from stale subscriptions', async () => {
    const wrapper = mountTerminal();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, { type: 'local_logs', sid: 99, lines: ['stale'] });
    await flushPromises();
    expect(snapshotLines(wrapper)).toHaveLength(0);
    wrapper.unmount();
  });

  it('hides lines by level toggle', async () => {
    const wrapper = mountTerminal();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['[INFO] keep me', '[ERROR] hide me'] });
    await flushPromises();

    await wrapper.find('[data-lvl="ERROR"]').trigger('click');
    expect(snapshotLines(wrapper)).toEqual(['[INFO] keep me']);
    wrapper.unmount();
  });

  it('filters lines by debounced plain search', async () => {
    const wrapper = mountTerminal();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['[INFO] order filled', '[INFO] heartbeat', '[ERROR] order rejected'] });
    await flushPromises();

    await wrapper.find('[data-test="log-search"]').setValue('order');
    vi.advanceTimersByTime(300);
    await flushPromises();

    const shown = snapshotLines(wrapper);
    expect(shown).toEqual(['[INFO] order filled', '[ERROR] order rejected']);
    expect(wrapper.find('[data-test="log-match-count"]').text()).toContain('2 matches');
    wrapper.unmount();
  });

  it('applies the Errors preset as a regex filter', async () => {
    const wrapper = mountTerminal();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, lines: ['[INFO] all good', 'Traceback (most recent call last)', '[ERROR] connection lost'] });
    await flushPromises();

    await wrapper.find('[data-preset="error|traceback|exception"]').trigger('click');
    await flushPromises();

    expect(snapshotLines(wrapper)).toEqual(['Traceback (most recent call last)', '[ERROR] connection lost']);
    wrapper.unmount();
  });

  it('pauses the stream and clears the terminal', async () => {
    const wrapper = mountTerminal();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);
    pushMessage(ws, { type: 'local_logs', sid: 1, streaming: true, lines: ['[INFO] one'] });
    await flushPromises();

    await wrapper.find('[data-test="log-stream"]').trigger('click');
    expect(ws.sentObjs().at(-1)).toEqual({ cmd: 'unsubscribe_local_logs' });

    await wrapper.find('[data-test="log-clear"]').trigger('click');
    expect(snapshotLines(wrapper)).toHaveLength(0);
    wrapper.unmount();
  });
});
