import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueueLogPanel from './QueueLogPanel.vue';
import type { OptimizeAdapter } from '../config';

const adapter: OptimizeAdapter = {
  version: 'v8',
  isV8: true,
  label: 'PBv8',
  apiBase: 'http://testserver/api/optimize-v8',
  archiveApiBase: '',
  backtestApiBase: '',
  metadataApiBase: '',
  paretoExplorerBase: '',
  queueLogPrefix: 'optimizes_v8/',
  websocketPath: '',
  navCurrent: 'v8_optimize',
  navSubtitle: 'PBv8 OPTIMIZE',
};

/** Minimal WebSocket double — the terminal only assigns handlers and sends. */
class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  url: string;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
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
    this.readyState = 3;
  }
}

function statusPayload(): Record<string, unknown> {
  return {
    name: 'alpha',
    phase: 'running',
    status: 'running',
    progress: { eval: 1200, target_iters: 5000, percent: 24.0, estimated: false, front: 42 },
    runtime: { backend: 'cpu', algorithm: 'nsga2', objective_count: 2, config_n_cpus: 8 },
    system: { cpu_percent: 42.5, memory_percent: 61.2, memory_used_bytes: 9663676416, memory_total_bytes: 17179869184 },
    process: { started_at: new Date().toISOString() },
    queue: { running: 1, queued: 2, error: 0 },
    log: { updated_at: new Date().toISOString(), last_line: 'gen 120', last_error: null },
    metrics: { objectives: { sharpe: 1.234 }, ranges: { roi: { min: 0.1, max: 2.5 } } },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('__BOOT__', { origin: 'http://testserver', token: '' });
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => statusPayload() }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mountPanel(filename = 'alpha.json') {
  return mount(QueueLogPanel, {
    props: { open: true, filename, title: 'alpha', adapter },
    global: { plugins: [createI18n('en')] },
  });
}

describe('QueueLogPanel', () => {
  it('renders a large themed dialog with an explicit close action', async () => {
    const wrapper = mountPanel();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('.optimize-log-overlay').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Close"]').exists()).toBe(true);

    await wrapper.find('[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('shows the ported dashboard and the Vue log terminal (no legacy global)', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect((window as unknown as { LogViewerPanel?: unknown }).LogViewerPanel).toBeUndefined();
    expect(wrapper.find('[data-test="optimize-log-dashboard"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="log-terminal"]').exists()).toBe(true);
    // The terminal subscribed to the queue item's prefixed log file.
    const ws = FakeWebSocket.instances[0]!;
    ws.onopen?.();
    const sent = ws.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
    expect(sent).toContainEqual({
      cmd: 'subscribe_local_logs',
      file: 'optimizes_v8/alpha.json.log',
      lines: 200,
      sid: 1,
      start_at_end: false,
    });
    wrapper.unmount();
  });

  it('polls /queue/{filename}/status and renders the dashboard values', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://testserver/api/optimize-v8/queue/alpha.json/status',
      expect.anything(),
    );
    expect(wrapper.find('[data-test="log-phase"]').text()).toContain('Running');
    expect(wrapper.find('[data-test="log-progress-label"]').text()).toContain('1,200 / 5,000 evals');
    expect(wrapper.find('[data-test="log-queue"]').text()).toBe('1 run · 2 queued · 0 err');
    wrapper.unmount();
  });

  it('keeps the dashboard readable when the status poll fails', async () => {
    fetchMock = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({ detail: 'gone' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPanel();
    await flushPromises();

    expect(wrapper.find('[data-test="log-activity"]').text()).toBe('Status unavailable');
    expect(wrapper.find('[data-test="log-error"]').text()).toBe('API 404: gone');
    wrapper.unmount();
  });

  it('forwards the dashboard mini actions', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.find('[data-test="log-open-results"]').trigger('click');
    await wrapper.find('[data-test="log-open-explorer"]').trigger('click');
    expect(wrapper.emitted('openResults')).toHaveLength(1);
    expect(wrapper.emitted('openExplorer')).toHaveLength(1);
    wrapper.unmount();
  });
});
