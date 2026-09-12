import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import LogPanel from './LogPanel.vue';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ origin: 'http://pbgui.test:8000', base_prefix: '', authenticated: true, version: '1.0.0', serial: 'S1' }),
  apiPath: (path: string) => path,
  wsOrigin: () => 'ws://pbgui.test:8000',
  pageOrigin: () => 'http://pbgui.test:8000',
}));

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

function mountLogPanel(visible = true) {
  return mount(LogPanel, {
    props: { visible },
    global: { plugins: [createI18n('en')] },
  });
}

function openSocket(ws: FakeWebSocket): void {
  ws.onopen?.();
}

function pushMessage(ws: FakeWebSocket, msg: unknown): void {
  ws.onmessage?.({ data: JSON.stringify(msg) });
}

function snapshotLines(wrapper: ReturnType<typeof mountLogPanel>): string[] {
  return wrapper.findAll('[data-line]').map((row) => row.text());
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  replaceMock = vi.fn();
  vi.stubGlobal('location', {
    replace: replaceMock,
    href: 'http://pbgui.test:8000/app/api_keys_editor',
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LogPanel Vue 3 + Tailwind CSS component', () => {
  it('renders modern card layout, header with title, back button, and default file badge', () => {
    const wrapper = mountLogPanel();
    expect(wrapper.find('h3').text()).toContain('Logs');
    expect(wrapper.text()).toContain('PBGui.log');
    expect(wrapper.find('[data-test="log-terminal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="preset-apikeys"]').exists()).toBe(true);
  });

  it('emits back when back button is clicked', async () => {
    const wrapper = mountLogPanel();
    const backBtn = wrapper.find('.back-btn');
    await backBtn.trigger('click');
    expect(wrapper.emitted('back')).toBeTruthy();
  });

  it('connects to WebSocket and subscribes to PBGui.log on mount when visible', () => {
    mountLogPanel();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe('ws://pbgui.test:8000/ws/vps');

    openSocket(ws);
    const sent = ws.sentObjs();
    expect(sent[0]).toEqual({ cmd: 'list_local_logs' });
    expect(sent[1]).toEqual({
      cmd: 'subscribe_local_logs',
      file: 'PBGui.log',
      lines: 200,
      sid: 1,
      start_at_end: false,
    });
  });

  it('populates availableFiles when receiving local_log_files', async () => {
    const wrapper = mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, {
      type: 'local_log_files',
      files: ['PBGui.log', 'PBApiServer.log', 'VPSMonitor.log'],
    });
    await flushPromises();

    expect(wrapper.text()).toContain('PBGui.log');
  });

  it('filters lines by [ApiKeys] preset by default', async () => {
    const wrapper = mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      streaming: true,
      lines: [
        '2026-09-13 00:00:01 [ApiKeys] [INFO] Loaded users successfully',
        '2026-09-13 00:00:02 [VPSMonitor] [INFO] CPU usage 12%',
        '2026-09-13 00:00:03 [ApiKeys] [WARNING] Key expiring in 3 days',
        '2026-09-13 00:00:04 [PBRun] [INFO] Bot running',
      ],
    });
    await flushPromises();

    const lines = snapshotLines(wrapper);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Loaded users successfully');
    expect(lines[1]).toContain('Key expiring in 3 days');
  });

  it('shows all lines when switching preset to All', async () => {
    const wrapper = mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      streaming: true,
      lines: [
        '2026-09-13 00:00:01 [ApiKeys] [INFO] Loaded users successfully',
        '2026-09-13 00:00:02 [VPSMonitor] [INFO] CPU usage 12%',
      ],
    });
    await flushPromises();

    await wrapper.find('[data-test="preset-all"]').trigger('click');
    await flushPromises();

    const lines = snapshotLines(wrapper);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Loaded users successfully');
    expect(lines[1]).toContain('CPU usage 12%');
  });

  it('filters by log level when level toggles are clicked', async () => {
    const wrapper = mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    // Switch to All so non-ApiKeys lines are also not filtered out by preset
    await wrapper.find('[data-test="preset-all"]').trigger('click');

    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      streaming: true,
      lines: [
        '2026-09-13 00:00:01 [INFO] Info message',
        '2026-09-13 00:00:02 [WARNING] Warning message',
        '2026-09-13 00:00:03 [ERROR] Error message',
      ],
    });
    await flushPromises();

    expect(snapshotLines(wrapper)).toHaveLength(3);

    // Toggle off INFO
    const infoBtn = wrapper.find('button[data-lvl="INFO"]');
    await infoBtn.trigger('click');
    await flushPromises();

    const afterInfoOff = snapshotLines(wrapper);
    expect(afterInfoOff).toHaveLength(2);
    expect(afterInfoOff.some((l) => l.includes('Info message'))).toBe(false);

    // Toggle INFO back on
    await infoBtn.trigger('click');
    await flushPromises();
    expect(snapshotLines(wrapper)).toHaveLength(3);
  });

  it('supports streaming pause and resume', async () => {
    const wrapper = mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      streaming: true,
      lines: ['2026-09-13 00:00:01 [ApiKeys] [INFO] User created'],
    });
    await flushPromises();

    const streamBtn = wrapper.find('[data-test="log-stream"]');
    expect(streamBtn.text()).toContain('Pause');

    // Click Pause
    await streamBtn.trigger('click');
    expect(ws.sentObjs()).toContainEqual({ cmd: 'unsubscribe_local_logs' });
    expect(streamBtn.text()).toContain('Stream');

    // Click Stream to resume
    await streamBtn.trigger('click');
    const sent = ws.sentObjs();
    expect(sent[sent.length - 1]).toEqual({
      cmd: 'subscribe_local_logs',
      file: 'PBGui.log',
      lines: 200,
      sid: 2,
      start_at_end: false,
    });
  });

  it('clears terminal when clear button is clicked', async () => {
    const wrapper = mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      streaming: true,
      lines: ['2026-09-13 00:00:01 [ApiKeys] [INFO] User created'],
    });
    await flushPromises();
    expect(snapshotLines(wrapper)).toHaveLength(1);

    await wrapper.find('[data-test="log-clear"]').trigger('click');
    await flushPromises();
    expect(snapshotLines(wrapper)).toHaveLength(0);
  });

  it('toggles line numbers on and off', async () => {
    const wrapper = mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    pushMessage(ws, {
      type: 'local_logs',
      sid: 1,
      streaming: true,
      lines: ['2026-09-13 00:00:01 [ApiKeys] [INFO] User created'],
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain('1\n');

    await wrapper.find('[data-test="log-linenums"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-line="0"]').text()).toContain('1');
  });

  it('handles session expiry code 4001 by redirecting to root', () => {
    mountLogPanel();
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    ws.onclose?.({ code: 4001 });
    expect(replaceMock).toHaveBeenCalledWith('/');
  });

  it('closes WebSocket connection when visible becomes false', async () => {
    const wrapper = mountLogPanel(true);
    const ws = FakeWebSocket.instances[0]!;
    openSocket(ws);

    await wrapper.setProps({ visible: false });
    expect(ws.closed).toBe(true);
  });
});
