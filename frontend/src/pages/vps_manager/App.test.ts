import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

const apiFetchMock = vi.fn();
vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

class WebSocketMock {
  static instances: WebSocketMock[] = [];
  static OPEN = 1;
  readyState = WebSocketMock.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { WebSocketMock.instances.push(this); }
  send(value: string): void { this.sent.push(value); }
  message(message: unknown): void { this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>); }
}

const overviewState = {
  config: { master_name: 'master-local', local_user: 'quran', vps_logging: { enabled: true }, vps_deploy: { command: 'vps-update-pbgui' } },
  errors: [],
  overview: { rows: [
    { hostname: 'master-local', name: 'master-local (local)', nav: 'master', online: true, cpu: 12.5, memory_percent: 40, disk_percent: 20, pbgui_version: '1.0', pb7_branch: 'main', pb7_commit: 'abc' },
    { hostname: 'alpha', name: 'alpha', nav: 'vps', online: true, ip: '10.0.0.2', cpu: 50, memory_percent: 60, disk_percent: 30, pb7_branch: 'main', pb7_commit: 'def' },
  ] },
  deploys: { history: [], progress_rows: [] },
};
const vpsDetail = {
  kind: 'vps', hostname: 'alpha', status: { online: true, ip: '10.0.0.2', latency_ms: 22 },
  config: { hostname: 'alpha', ssh_host: '10.0.0.2', ssh_user: 'bot', ssh_port: 22, pbgui_dir: 'software/pbgui', initialized: true },
  branches: { pbgui: { current_branch: 'main', current_commit: 'abc' }, pb7: { branch: 'main', commit: 'def' } },
  monitor: { instances: [{ name: 'bot-a', status: 'running', cpu: 10, pnl_today: 1.2 }] },
  progress: {}, logfiles: ['PBRun.log'], log_preview: { filename: 'PBRun.log', content: 'safe <log>' },
};

function mountApp() { return mount(App, { global: { plugins: [createI18n('en')] } }); }

beforeEach(() => {
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = { origin: 'http://test', token: '', version: 'test', serial: '1' };
  WebSocketMock.instances = [];
  vi.stubGlobal('WebSocket', WebSocketMock);
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    if (url.includes('/metric-history/')) return Promise.resolve({ points: [{ ts: 1, value: 10 }, { ts: 2, value: 20 }] });
    if (url.includes('/detail/')) return Promise.resolve(vpsDetail);
    return Promise.resolve({ ok: true });
  });
});

describe('VPS Manager Vue page', () => {
  it('renders overview state, selects a VPS context over the cookie WebSocket, and renders detail safely', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: overviewState });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('master-local');
    expect(wrapper.text()).toContain('alpha');
    await wrapper.get('[data-action="select-vps"][data-host="alpha"]').trigger('click');
    const context = JSON.parse(ws.sent.at(-1)!);
    expect(context).toMatchObject({ cmd: 'set_context', view: 'vps', hostname: 'alpha' });
    ws.message({ type: 'detail', data: vpsDetail, context_generation: context.context_generation });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('bot-a');
    expect(wrapper.text()).toContain('safe <log>');
    expect(wrapper.find('[data-secret="session"]').exists()).toBe(false);
  });

  it('sends refresh, setup and deploy actions, and loads metric history through authenticated APIs', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: overviewState });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="refresh"]').trigger('click');
    expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ cmd: 'refresh' });
    await wrapper.get('[data-action="select-vps"][data-host="alpha"]').trigger('click');
    ws.message({ type: 'detail', data: vpsDetail, context_generation: 1 });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="metric-history"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/metric-history/alpha'));
    await wrapper.get('[data-action="setup-vps"]').trigger('click');
    expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ cmd: 'setup_vps', hostname: 'alpha' });
    await wrapper.get('[data-action="deploy-vps"]').trigger('click');
    expect(JSON.parse(ws.sent.at(-1)!)).toMatchObject({ cmd: 'run_vps_deploy' });
  });

  it('keeps destructive actions behind explicit modal controls and does not close on backdrop click', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: overviewState });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="select-vps"][data-host="alpha"]').trigger('click');
    ws.message({ type: 'detail', data: vpsDetail, context_generation: 1 });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="delete-vps"]').trigger('click');
    expect(wrapper.get('[data-modal="confirm"]').text()).toContain('alpha');
    await wrapper.get('[data-modal="confirm"]').trigger('click');
    expect(wrapper.find('[data-modal="confirm"]').exists()).toBe(true);
    await wrapper.get('[data-close="confirm"]').trigger('click');
    expect(wrapper.find('[data-modal="confirm"]').exists()).toBe(false);
  });

  it('cleans up stale WebSocket callbacks', () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    wrapper.unmount();
    expect(ws.close).toHaveBeenCalled();
  });
});
