import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

const apiFetchMock = vi.fn();
vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

class ViewerMock {
  static instances: ViewerMock[] = [];
  options: Record<string, unknown>;
  open = vi.fn();
  close = vi.fn();
  setFile = vi.fn();
  fetchFile = vi.fn();
  constructor(options: Record<string, unknown>) {
    this.options = options;
    ViewerMock.instances.push(this);
  }
}

const filesPayload = {
  files: ['PBGui.log'],
  sizes: { 'PBGui.log': 100, 'PBGui.log.1': 50 },
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

beforeEach(() => {
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = { origin: 'http://test', token: '', version: 'test', serial: '1' };
  apiFetchMock.mockReset();
  ViewerMock.instances = [];
  (window as unknown as { LogViewerPanel: typeof ViewerMock }).LogViewerPanel = ViewerMock;
  apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/rotation') && (!init || init.method !== 'POST')) return Promise.resolve(rotationPayload);
    if (url.endsWith('/api/logging')) return Promise.resolve(filesPayload);
    if (url.includes('/purge/')) return Promise.resolve({ success: true, message: 'purged' });
    if (url.endsWith('/rotation') && init?.method === 'POST') return Promise.resolve({ success: true, apply: { message: 'Restart required' } });
    throw new Error(`Unexpected request ${url}`);
  });
});

describe('Logging Monitor Vue page', () => {
  it('mounts the shared log viewer and exposes rotated files and purge confirmation', async () => {
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find('#topnav').exists()).toBe(true);
    expect(ViewerMock.instances).toHaveLength(1);
    const viewer = ViewerMock.instances[0]!;
    expect(viewer.options).toMatchObject({ defaultHost: 'local', presets: 'system', showRestart: true });
    expect(viewer.open).toHaveBeenCalled();

    (viewer.options.onFileChange as (name: string) => void)('PBGui.log');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-field="rotation-version"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="rotation-version"] option[value="PBGui.log.1"]').exists()).toBe(true);

    await wrapper.find('[data-action="purge"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').text()).toContain('Purge log file');
    await wrapper.find('[data-confirm="purge"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/purge/PBGui.log'), expect.objectContaining({ method: 'POST' }));
    expect(viewer.setFile).toHaveBeenCalledWith('PBGui.log');
  });

  it('loads and saves default, managed, and per-log rotation settings', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('[data-view="settings"]').trigger('click');
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

  it('requires an explicit button to close the purge dialog', async () => {
    const wrapper = mountApp();
    await flushPromises();
    const viewer = ViewerMock.instances[0]!;
    (viewer.options.onFileChange as (name: string) => void)('PBGui.log');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-action="purge"]').trigger('click');
    await wrapper.find('.log-modal-backdrop').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    await wrapper.find('[data-action="cancel-purge"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
});
