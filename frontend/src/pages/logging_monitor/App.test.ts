import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { openSelect, selectOptionTexts } from '@/shared/testing/select';
import App from './App.vue';

const apiFetchMock = vi.fn();
vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

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

const filesPayload = {
  files: ['PBGui.log', 'PBApiServer.log'],
  sizes: { 'PBGui.log': 4096, 'PBGui.log.1': 512, 'PBApiServer.log': 128 },
  rotated: { 'PBGui.log': ['PBGui.log.1'] },
};
const rotationPayload = {
  default: { max_mb: 10, backup_count: 2 },
  managed_scopes: {
    api_console: { label: 'API console', description: 'PBApiServer.console.log', max_mb: 20, backup_count: 3 },
  },
  per_service: { PBGui: { max_mb: 12, backup_count: 4 } },
  apply: { message: 'Restart required' },
};

function mountApp() {
  return mount(App, { global: { plugins: [createI18n('en')] } });
}

function openSocket(): FakeWebSocket {
  const ws = FakeWebSocket.instances[0]!;
  ws.onopen?.();
  return ws;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = {
    origin: 'http://test',
    base_prefix: '',
    authenticated: true,
    version: 'test',
    serial: '1',
  };
  apiFetchMock.mockReset();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  Element.prototype.scrollIntoView = vi.fn();
  apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/rotation') && (!init || init.method !== 'POST')) return Promise.resolve(rotationPayload);
    if (url.endsWith('/api/logging')) return Promise.resolve(filesPayload);
    if (url.includes('/purge/')) return Promise.resolve({ success: true, message: 'purged' });
    if (url.endsWith('/rotation') && init?.method === 'POST') return Promise.resolve({ success: true, apply: { message: 'Restart required' } });
    throw new Error(`Unexpected request ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Logging Monitor Vue page', () => {
  it('mounts the shared log viewer with the system presets and restart control', async () => {
    const wrapper = mountApp();
    await flushPromises();
    openSocket();
    await flushPromises();

    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.find('#topnav').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toContain('Connected');

    expect(wrapper.find('[data-test="log-terminal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="log-restart"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="log-file-list"]').exists()).toBe(true);
    for (const preset of ['errors', 'warnings', 'errorsWarnings', 'connection', 'restartStop', 'traceback']) {
      expect(wrapper.find(`[data-test="preset-${preset}"]`).exists()).toBe(true);
    }
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('auto-selects the first log file, subscribes to it and reveals rotated variants', async () => {
    const wrapper = mountApp();
    await flushPromises();
    const ws = openSocket();
    await flushPromises();

    expect(wrapper.find('[data-field="rotation-version"]').exists()).toBe(true);
    await openSelect(wrapper, '[data-field="rotation-version"]');
    expect(selectOptionTexts()).toEqual(['Current', '.1']); // "PBGui.log.1".slice("PBGui.log".length)

    const subscribe = ws.sentObjs().find((entry) => entry.cmd === 'subscribe_local_logs');
    expect(subscribe).toMatchObject({ file: 'PBGui.log', lines: 200, start_at_end: false });
  });

  it('wires the rotated-variant select to the viewer handle (one-shot fetch, then resubscribe)', async () => {
    const wrapper = mountApp();
    await flushPromises();
    const ws = openSocket();
    await flushPromises();

    const handle = wrapper.findComponent({ name: 'LogViewer' }).vm as unknown as {
      fetchFile(file: string): void;
      setFile(file: string): void;
    };

    handle.fetchFile('PBGui.log.1');
    await flushPromises();
    expect(ws.sentObjs()).toContainEqual(
      expect.objectContaining({ cmd: 'get_local_logs', file: 'PBGui.log.1' })
    );

    handle.setFile('PBGui.log');
    await flushPromises();
    const last = ws.sentObjs().at(-1);
    expect(last).toEqual(
      expect.objectContaining({ cmd: 'subscribe_local_logs', file: 'PBGui.log' })
    );
  });

  it('purges the selected log file through the confirmation dialog', async () => {
    const wrapper = mountApp();
    await flushPromises();
    openSocket();
    await flushPromises();

    await wrapper.find('[data-action="purge"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').text()).toContain('Purge log file');
    await wrapper.find('[data-confirm="purge"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/purge/PBGui.log'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('loads and saves default, managed, and per-log rotation settings', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('[data-testid="rail-section-settings"]').trigger('click');
    expect(wrapper.text()).toContain('Default Rotation');
    expect(wrapper.text()).toContain('API console');
    expect(wrapper.text()).toContain('PBGui');

    await wrapper.find('[data-field="default-max-mb"]').setValue('25');
    await wrapper.find('[data-field="default-backup-count"]').setValue('5');
    await wrapper.find('[data-save-scope="default"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/rotation$/), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ scope: 'default', max_mb: 25, backup_count: 5 }),
    }));

    await wrapper.find('[data-save-scope="managed:api_console"]').trigger('click');
    await wrapper.find('[data-save-scope="PBGui"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/rotation$/), expect.objectContaining({ body: expect.stringContaining('managed:api_console') }));
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/rotation$/), expect.objectContaining({ body: expect.stringContaining('PBGui') }));
  });

  it('renders the shared empty state when no per-log rules are returned', async () => {
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/rotation') && (!init || init.method !== 'POST')) {
        return Promise.resolve({ ...rotationPayload, per_service: {} });
      }
      if (url.endsWith('/api/logging')) return Promise.resolve(filesPayload);
      throw new Error(`Unexpected request ${url}`);
    });

    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('[data-testid="rail-section-settings"]').trigger('click');

    const emptyState = wrapper.get('[data-state="empty"]');
    expect(emptyState.attributes('role')).toBe('status');
    expect(emptyState.attributes('aria-live')).toBe('polite');
    expect(emptyState.text()).toContain('No log files found');
  });

  it('requires an explicit button to close the purge dialog', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('[data-action="purge"]').trigger('click');
    await wrapper.find('.log-modal-backdrop').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await wrapper.find('[data-action="cancel-purge"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('renders loading and error status copy as text', async () => {
    let rejectLoad!: (error: Error) => void;
    apiFetchMock.mockReturnValue(new Promise((_resolve, reject) => { rejectLoad = reject; }));
    const wrapper = mountApp();
    expect(wrapper.get('[role="status"]').text()).toContain('Loading');

    rejectLoad(new Error('logging unavailable'));
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain('Error');
    expect(wrapper.get('[role="status"]').attributes('data-tone')).toBe('danger');
  });
});
