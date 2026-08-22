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
  url: string;
  readyState = WebSocketMock.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(url: string) {
    this.url = url;
    WebSocketMock.instances.push(this);
  }

  open(): void {
    this.onopen?.();
  }

  jobs(data: unknown[]): void {
    this.onmessage?.({ data: JSON.stringify({ type: 'jobs', data }) } as MessageEvent<string>);
  }
}

const activeJobs = [
  {
    id: 'run-1',
    type: 'bitget_best_1m_distributed',
    exchange: 'bitget',
    status: 'running',
    created_ts: 100,
    updated_ts: 110,
    progress: { step: 1, total: 2, chunk_done: 1, chunk_total: 2, coin: 'BTCUSDT' },
  },
  { id: 'hidden-1', type: 'hl_l2_download', exchange: 'hyperliquid', status: 'pending', created_ts: 90 },
];

function mountApp(search = '') {
  window.history.replaceState({}, '', `/api/jobs/main_page${search}`);
  return mount(App, { global: { plugins: [createI18n('en')] } });
}

beforeEach(() => {
  vi.useRealTimers();
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = {
    origin: 'http://test',
    token: '',
    version: 'test',
    serial: '1',
  };
  apiFetchMock.mockReset();
  WebSocketMock.instances = [];
  vi.stubGlobal('WebSocket', WebSocketMock);
  apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/jobs/?states=done')) {
      return Promise.resolve({ jobs: [{ id: 'done-1', type: 'bitget_best_1m_distributed', exchange: 'bitget', status: 'done', updated_ts: 500 }] });
    }
    if (url.includes('/jobs/?states=failed')) {
      return Promise.resolve({ jobs: [{ id: 'failed-1', type: 'bitget_best_1m_distributed', exchange: 'bitget', status: 'failed', updated_ts: 600 }] });
    }
    if (url.endsWith('/jobs/run-1/log?lines=500')) return Promise.resolve({ exists: true, log: ['safe <line>'] });
    if (url.endsWith('/jobs/run-1/log?lines=0')) return Promise.resolve({ exists: true, log: [] });
    if (url.endsWith('/jobs/run-1')) return Promise.resolve(activeJobs[0]);
    if (url.includes('/jobs/')) return Promise.resolve({ success: true });
    if (url.endsWith('/jobs/cancel')) return Promise.resolve({ success: true });
    if (url.endsWith('/jobs/bulk-delete')) return Promise.resolve({ success: true, deleted: 1, total: 1 });
    if (init?.method) return Promise.resolve({ success: true });
    throw new Error(`Unexpected request ${url}`);
  });
});

describe('Shared Jobs Monitor Vue page', () => {
  it('renders filtered live jobs and worker connection state from the cookie-authenticated WebSocket', async () => {
    const wrapper = mountApp('?embed=1&exchange=bitget&job_type=bitget_best_1m_distributed');
    expect(document.documentElement.classList.contains('is-embedded')).toBe(true);
    expect(WebSocketMock.instances[0]?.url).toBe('ws://test/ws/jobs');
    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.findAll('[data-status]')).toHaveLength(2);
    expect(wrapper.get('.jobs-tab-panel.active [role="status"]').text()).toContain('No Active jobs');
    expect(wrapper.text()).toContain('Connecting');

    WebSocketMock.instances[0]!.open();
    WebSocketMock.instances[0]!.jobs(activeJobs);
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-status="connection"]').text()).toContain('Connected');
    expect(wrapper.text()).toContain('run-1');
    expect(wrapper.text()).not.toContain('hidden-1');
    expect(wrapper.get('[data-status="worker"]').text()).toContain('Running');
  });

  it('keeps visible action labels beside Phosphor icons', async () => {
    const wrapper = mountApp('?exchange=bitget');
    WebSocketMock.instances[0]!.jobs([{ ...activeJobs[0], status: 'pending' }]);
    await wrapper.vm.$nextTick();

    const runButton = wrapper.get('[data-action="run"]');
    expect(runButton.text()).toContain('Run');
    expect(runButton.find('svg').exists()).toBe(true);
  });

  it('renders empty history copy after a successful empty response', async () => {
    apiFetchMock.mockResolvedValueOnce({ jobs: [] });
    const wrapper = mountApp('?exchange=bitget');

    await wrapper.get('[data-tab="done"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('.jobs-tab-panel.active').text()).toContain('No done jobs');
  });

  it('loads sorted history and invokes run, cancel, retry, requeue, and delete actions after confirmation', async () => {
    const wrapper = mountApp('?exchange=bitget');
    WebSocketMock.instances[0]!.jobs([{ ...activeJobs[0], status: 'pending' }, activeJobs[1]]);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-action="run"]').trigger('click');
    await wrapper.get('[data-confirm="accept"]').trigger('click');
    WebSocketMock.instances[0]!.jobs([activeJobs[0], activeJobs[1]]);
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="cancel"]').trigger('click');
    await wrapper.get('[data-confirm="accept"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/jobs/run-1/run', expect.objectContaining({ method: 'POST' }));
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/jobs/cancel', expect.objectContaining({ method: 'POST' }));

    await wrapper.get('[data-tab="failed"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('failed-1');
    await wrapper.get('[data-action="retry"]').trigger('click');
    await wrapper.get('[data-confirm="accept"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/jobs/failed-1/retry', expect.objectContaining({ method: 'POST' }));

    await wrapper.get('[data-tab="done"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-action="requeue"]').trigger('click');
    await wrapper.get('[data-confirm="accept"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/jobs/done-1/requeue', expect.objectContaining({ method: 'POST' }));

    await wrapper.get('.jobs-tab-panel.active [data-action="delete"]').trigger('click');
    await wrapper.get('[data-confirm="accept"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/jobs/done-1?states=done', expect.objectContaining({ method: 'DELETE' }));
  });

  it('uses explicit modal controls for logs, details, and delete-all', async () => {
    const wrapper = mountApp('?exchange=bitget');
    WebSocketMock.instances[0]!.jobs(activeJobs);
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-action="log"]').trigger('click');
    await flushPromises();
    const logDialog = wrapper.get('[data-modal="log"]');
    expect(logDialog.text()).toContain('safe <line>');
    await logDialog.trigger('click');
    expect(wrapper.find('[data-modal="log"]').exists()).toBe(true);
    await wrapper.get('[data-close="log"]').trigger('click');
    expect(wrapper.find('[data-modal="log"]').exists()).toBe(false);

    await wrapper.get('[data-action="details"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-modal="details"]').text()).toContain('BTCUSDT');
    await wrapper.get('[data-close="details"]').trigger('click');

    await wrapper.get('[data-tab="done"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-action="delete-all"]').trigger('click');
    const confirm = wrapper.get('[data-modal="confirm"]');
    await confirm.trigger('click');
    expect(wrapper.find('[data-modal="confirm"]').exists()).toBe(true);
    await wrapper.get('[data-confirm="accept"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/jobs/bulk-delete', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ delete_all: true, state: 'done', exchange: 'bitget' }),
    }));
  });

  it('closes the active modal with Escape and tears down the current WebSocket generation', async () => {
    const wrapper = mountApp();
    WebSocketMock.instances[0]!.jobs(activeJobs);
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="cancel"]').trigger('click');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-modal="confirm"]').exists()).toBe(false);

    const socket = WebSocketMock.instances[0]!;
    wrapper.unmount();
    expect(socket.close).toHaveBeenCalled();
    socket.onclose?.();
    expect(WebSocketMock.instances).toHaveLength(1);
  });
});
