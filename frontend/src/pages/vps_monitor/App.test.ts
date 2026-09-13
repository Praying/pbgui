import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

class WebSocketMock {
  static instances: WebSocketMock[] = [];
  static OPEN = 1;
  url: string;
  readyState = WebSocketMock.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  constructor(url: string) { this.url = url; WebSocketMock.instances.push(this); }
  send(value: string): void { this.sent.push(value); }
  sentObjs(): Array<Record<string, unknown>> { return this.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>); }
  state(data: unknown): void { this.onmessage?.({ data: JSON.stringify({ type: 'state', data }) } as MessageEvent<string>); }
  message(message: unknown): void { this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>); }
}

const state = {
  connections: {
    total: 1,
    connected: 1,
    connecting: 0,
    disconnected: 0,
    connections: { alpha: { status: 'connected', ip: '10.0.0.2' } },
  },
  system: {
    alpha: {
      timestamp: 1_700_000_000,
      cpu: 42.5,
      cpu_60s: 40,
      cpu_60s_window: 60,
      mem_total: 8 * 1024 ** 3,
      mem_used: 4 * 1024 ** 3,
      mem_available: 4 * 1024 ** 3,
      mem_percent: 50,
      disk_total: 100 * 1024 ** 3,
      disk_used: 25 * 1024 ** 3,
      disk_free: 75 * 1024 ** 3,
      disk_percent: 25,
      swap_total: 0,
      swap_used: 0,
      swap_free: 0,
      swap_percent: 0,
    },
  },
  instances: { alpha: [{ name: 'bot-a', pb_version: '7', status: 'running', cpu: 12.3, pnlToday: 1.2, pnl4w: 10, fillsToday: 2, fills4w: 20, tbsToday: 0, tbs4w: 1 }] },
  v7_instances: { alpha: [{ name: 'bot-a', running: true }] },
  v8_instances: { alpha: [{ name: 'bot-b', running: true }] },
  host_meta: { alpha: { bots: {} } },
  services: { alpha: { PBRun: { status: 'running', pid: 123 } } },
  streams: { alpha: { monitor_agent: { status: 'ok', heartbeat: 1, files: [] } } },
  local_logs: ['PBGui.log'],
  ui_settings: { compact: 'false', debug_logging: 'false' },
  timestamp: 1_700_000_000,
};

function mountApp(search = '') {
  window.history.replaceState({}, '', `/api/vps/main_page${search}`);
  return mount(App, { global: { plugins: [createI18n('en')] } });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = { origin: 'http://test', base_prefix: '', authenticated: true, version: 'test', serial: '1' };
  WebSocketMock.instances = [];
  vi.stubGlobal('WebSocket', WebSocketMock);
});

describe('VPS Monitor Vue page', () => {
  it('explains the unconfigured state and links to VPS Manager', async () => {
    const wrapper = mountApp();
    WebSocketMock.instances[0]!.state({ connections: { total: 0, connected: 0, connecting: 0, disconnected: 0, connections: {} } });
    await wrapper.vm.$nextTick();

    const emptyState = wrapper.get('[data-state="empty"]');
    expect(emptyState.text()).toContain('No VPS servers configured.');
    expect(emptyState.text()).toContain('Add a VPS host in VPS Manager');
    expect(emptyState.text()).toContain('Open VPS Manager');
  });

  it('renders live dashboard state safely and applies URL/UI filters', async () => {
    const wrapper = mountApp('?hide_ip=1&compact=1');
    WebSocketMock.instances[0]!.onopen?.();
    WebSocketMock.instances[0]!.state(state);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.pbgui-status-strip').text()).toContain('Connected');
    expect(wrapper.text()).toContain('alpha');
    expect(wrapper.findAll('[data-tone="success"] dt').map((element) => element.text())).toContain(
      'Connected',
    );
    expect(wrapper.get('.vps-monitor').classes()).toContain('compact');
    expect(wrapper.get('[role="status"]').text()).toContain('Connected');
    await wrapper.get('[data-option="compact"]').trigger('click');
    expect(wrapper.text()).toContain('42.5');
    await wrapper.get('[data-testid="rail-section-instances"]').trigger('click');
    expect(wrapper.text()).toContain('bot-a');
    expect(wrapper.find('[data-ip="alpha"]').exists()).toBe(false);
  });

  it('switches tabs, sends service/instance commands and opens metric history', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.state(state);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="rail-section-instances"]').trigger('click');
    await wrapper.get('[data-action="kill-instance"]').trigger('click');
    expect(wrapper.get('[data-action="kill-instance"]').text()).toContain('Restart (kill)');
    expect(wrapper.get('[data-action="kill-instance"]').find('svg').exists()).toBe(true);
    expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ cmd: 'kill_instance', host: 'alpha', name: 'bot-a', pb_version: '7' });

    await wrapper.get('[data-testid="rail-section-services"]').trigger('click');
    await wrapper.get('[data-action="restart-service"]').trigger('click');
    expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ cmd: 'restart_service', host: 'alpha', service: 'PBRun' });

    await wrapper.get('[data-testid="rail-section-dashboard"]').trigger('click');
    await wrapper.get('[data-history-host="alpha"][data-history-metric="cpu"]').trigger('click');
    expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ cmd: 'get_cpu_history', host: 'alpha', metric: 'cpu' });
    ws.message({ type: 'cpu_history', host: 'alpha', metric: 'cpu', data: { points: [{ ts: 1, value: 10 }, { ts: 2, value: 20 }] } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-modal="history"]').text()).toContain('20');
    await wrapper.get('[data-close="history"]').trigger('click');
  });

  it('mounts the shared Vue log viewer on the Live Logs tab with host + trading presets', async () => {
    const wrapper = mountApp();
    WebSocketMock.instances[0]!.state(state);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="rail-section-logs"]').trigger('click');
    await flushPromises();

    // Page socket stays instances[0]; the viewer opens its own connection.
    const viewerSocket = WebSocketMock.instances[1]!;
    expect(viewerSocket).toBeTruthy();

    expect(wrapper.find('[data-test="log-terminal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="log-host-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="log-file-list"]').exists()).toBe(true);
    for (const preset of ['ordersFills', 'balancePnl', 'positions', 'startup']) {
      expect(wrapper.find(`[data-test="preset-${preset}"]`).exists()).toBe(true);
    }
    // Local default host, Trading preset set.
    expect(viewerSocket.sentObjs()).toContainEqual(
      expect.objectContaining({ cmd: 'subscribe_local_logs', file: 'PBGui.log' })
    );
  });

  it('drives a remote bot subscription from the Instances log action', async () => {
    const wrapper = mountApp();
    WebSocketMock.instances[0]!.state(state);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="rail-section-instances"]').trigger('click');
    await wrapper.get('[data-action="view-instance-log"]').trigger('click');
    await flushPromises();

    const viewerSocket = WebSocketMock.instances[1]!;
    viewerSocket.onopen?.();
    await flushPromises();

    expect(viewerSocket.sentObjs()).toContainEqual(
      expect.objectContaining({ cmd: 'subscribe_logs', host: 'alpha', service: 'Bot:bot-a:7' })
    );
    expect(viewerSocket.sentObjs()).toContainEqual(
      expect.objectContaining({ cmd: 'get_log_info', host: 'alpha', service: 'Bot:bot-a:7' })
    );
    // The remote item list exposes the host's services and running bots.
    expect(wrapper.find('[data-test="log-remote-item-PBRun"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="log-remote-item-Bot:bot-a:7"]').exists()).toBe(true);
  });

  it('renders server results without HTML interpolation and closes modal explicitly', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.state(state);
    await wrapper.vm.$nextTick();
    ws.message({ type: 'result', cmd: 'restart_service', ok: true, message: '<safe result>' });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('<safe result>');
    expect(wrapper.find('[data-modal="result"]').exists()).toBe(true);
    await wrapper.find('[data-modal="result"]').trigger('click');
    expect(wrapper.find('[data-modal="result"]').exists()).toBe(true);
    await wrapper.get('[data-close="result"]').trigger('click');
    expect(wrapper.find('[data-modal="result"]').exists()).toBe(false);
  });

  it('renders stale monitor-agent state as visible text', async () => {
    const wrapper = mountApp();
    WebSocketMock.instances[0]!.state({
      ...state,
      streams: { alpha: { monitor_agent: { status: 'stale', files: { heartbeat: { state: 'stale' } } } } },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('heartbeat: stale');
  });

  it('cleans up the WebSocket generation and the viewer connection', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    await flushPromises();
    await wrapper.get('[data-testid="rail-section-logs"]').trigger('click');
    await flushPromises();
    const viewerSocket = WebSocketMock.instances[1]!;
    wrapper.unmount();
    expect(ws.close).toHaveBeenCalled();
    expect(viewerSocket.close).toHaveBeenCalled();
  });
});
