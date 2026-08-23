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
  state(data: unknown): void { this.onmessage?.({ data: JSON.stringify({ type: 'state', data }) } as MessageEvent<string>); }
  message(message: unknown): void { this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>); }
}

class ViewerMock {
  static instances: ViewerMock[] = [];
  options: Record<string, unknown>;
  open = vi.fn();
  close = vi.fn();
  constructor(options: Record<string, unknown>) { this.options = options; ViewerMock.instances.push(this); }
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
  v7_instances: { alpha: [] },
  v8_instances: { alpha: [] },
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
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = { origin: 'http://test', token: '', version: 'test', serial: '1' };
  WebSocketMock.instances = [];
  ViewerMock.instances = [];
  vi.stubGlobal('WebSocket', WebSocketMock);
  (window as unknown as { LogViewerPanel: typeof ViewerMock }).LogViewerPanel = ViewerMock;
});

describe('VPS Monitor Vue page', () => {
  it('renders live dashboard state safely and applies URL/UI filters', async () => {
    const wrapper = mountApp('?hide_ip=1&compact=1');
    WebSocketMock.instances[0]!.onopen?.();
    WebSocketMock.instances[0]!.state(state);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-status="connection"]').text()).toContain('Connected');
    expect(wrapper.text()).toContain('alpha');
    expect(wrapper.get('.vps-monitor').classes()).toContain('compact');
    expect(wrapper.get('[role="status"]').text()).toContain('Connected');
    await wrapper.get('[data-option="compact"]').setValue(false);
    expect(wrapper.text()).toContain('42.5');
    await wrapper.get('[data-testid="rail-section-instances"]').trigger('click');
    expect(wrapper.text()).toContain('bot-a');
    expect(wrapper.find('[data-ip="alpha"]').exists()).toBe(false);
  });

  it('switches tabs, sends service/instance commands, opens metric history, and uses shared log viewer', async () => {
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

    await wrapper.get('[data-testid="rail-section-logs"]').trigger('click');
    expect(ViewerMock.instances).toHaveLength(1);
    expect(ViewerMock.instances[0]!.options).toMatchObject({ defaultHost: 'local', presets: 'trading', showRestart: true });
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

  it('cleans up the WebSocket generation and closes the shared viewer', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    await flushPromises();
    await wrapper.get('[data-testid="rail-section-logs"]').trigger('click');
    wrapper.unmount();
    expect(ws.close).toHaveBeenCalled();
    expect(ViewerMock.instances[0]!.close).toHaveBeenCalled();
  });
});
