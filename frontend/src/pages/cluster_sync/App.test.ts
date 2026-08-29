import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

const apiFetchMock = vi.fn();
vi.mock('@/shared/api', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api')>('@/shared/api');
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const status = {
  identity: { cluster_id: 'cluster-1', node_id: 'node-local', role: 'master' },
  local_node: { node_id: 'node-local', pbname: 'local', role: 'master', sync_enabled: true, sync_mode: 'reachable' },
  generation: 4,
  counts: { nodes: 2, instances: 1, conflicts: 0, oplog: 4 },
  credentials: { nodes: { 'node-local': { current: true, key_state: 'ready' } }, active: 1, conflicts: [] },
  retention_policy: { mode: 'report_only', history_days: 7, generation: 4 },
  checkpoint: { status: 'ready', generation: 4 },
  sync_status: { healthy: true },
  warnings: [],
};
const nodes = {
  nodes: [
    { node_id: 'node-local', pbname: 'local', role: 'master', sync_enabled: true, sync_mode: 'reachable', ssh_host: '127.0.0.1', ssh_user: 'quran', ssh_port: 22 },
    { node_id: 'node-remote', pbname: 'remote', role: 'master', sync_enabled: true, sync_mode: 'reachable', ssh_host: '10.0.0.2', ssh_user: 'bot', ssh_port: 22 },
  ],
  credentials: status.credentials,
  local_cluster_ssh: { ok: true, fingerprint: 'SHA256:test' },
};
const desired = { instances: [{ instance: 'bot-a', current_version: '1', desired_version: '2', conflicted: false }], tombstones: [{ instance: 'old-bot', created_at: 1700000000 }], credentials: status.credentials };

function mountApp() { return mount(App, { global: { plugins: [createI18n('en')] } }); }

beforeEach(() => {
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = { origin: 'http://test', token: '', version: 'test', serial: '1' };
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/status')) return Promise.resolve(status);
    if (url.endsWith('/nodes')) return Promise.resolve(nodes);
    if (url.endsWith('/desired-state')) return Promise.resolve(desired);
    if (url.includes('/oplog')) return Promise.resolve({ count: 1, operations: [{ op: 'ADD_NODE', node_id: 'node-local', created_at: 1700000000, seq: 1 }] });
    if (url.endsWith('/retention/report')) return Promise.resolve({ policy: status.retention_policy, runtime: { status: 'ready' }, blockers: [] });
    if (url.endsWith('/bootstrap-preview')) return Promise.resolve({ items: [], counts: { add: 0, update: 0, skip: 0 } });
    if (url.endsWith('/remote-status')) return Promise.resolve({ nodes: [{ node_id: 'node-remote', reachable: true, status: 'ok' }] });
    if (init?.method) return Promise.resolve({ ok: true, changed: true, message: 'updated' });
    throw new Error(`Unexpected request ${url}`);
  });
});

describe('Cluster Sync Vue page', () => {
  it('loads status, node membership, desired state and safe data-bound tables', async () => {
    const wrapper = mountApp();
    await flushPromises();
    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.get('[role="status"]').text()).toContain('OK');
    expect(wrapper.get('.workspace-header__actions button').find('svg').exists()).toBe(true);
    expect(wrapper.get('[data-section="overview"]').text()).toContain('cluster-1');
    await wrapper.get('[data-testid="rail-section-nodes"]').trigger('click');
    expect(wrapper.text()).toContain('node-remote');
    await wrapper.get('[data-testid="rail-section-instances"]').trigger('click');
    expect(wrapper.text()).toContain('bot-a');
    await wrapper.get('[data-testid="rail-section-overview"]').trigger('click');
    expect(wrapper.text()).not.toContain('Bearer');
    expect(wrapper.get('[data-count="nodes"]').text()).toContain('2');
  });

  it('renders the themed cluster-node hierarchy and operational summary', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-testid="rail-section-nodes"]').trigger('click');

    const nodeSection = wrapper.get('[data-section="nodes"]');
    expect(nodeSection.find('.cluster-nodes-head').text()).toContain('Review cluster membership');
    expect(nodeSection.find('[data-node-stat="total"]').text()).toBe('2');
    expect(nodeSection.find('[data-node-stat="sync-enabled"]').text()).toBe('2');
    expect(nodeSection.find('[data-node-stat="masters"]').text()).toBe('2');
    expect(nodeSection.find('[data-node-stat="ssh-configured"]').text()).toBe('2');
    expect(nodeSection.find('.cluster-node-table').classes()).toContain('min-w-[980px]');
    expect(nodeSection.text()).toContain('Local');
    expect(nodeSection.find('[data-action="toggle-sync"][data-node-id="node-local"]').attributes('disabled')).toBeDefined();
    expect(nodeSection.find('[data-action="remove-node"][data-node-id="node-local"]').attributes('disabled')).toBeDefined();
  });

  it('switches sections and performs retention/node actions through authenticated JSON endpoints', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-testid="rail-section-nodes"]').trigger('click');
    await wrapper.get('[data-action="toggle-sync"][data-node-id="node-remote"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/cluster/nodes/node-remote/sync?sync_enabled=false', expect.objectContaining({ method: 'POST' }));

    await wrapper.get('[data-testid="rail-section-retention"]').trigger('click');
    await wrapper.get('[data-field="history-days"]').setValue('30');
    await wrapper.get('[data-action="save-retention"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith('http://test/api/cluster/retention/settings', expect.objectContaining({ method: 'POST', body: expect.stringContaining('30') }));
  });

  it('requires explicit controls for remove confirmation and does not close on backdrop click', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-testid="rail-section-nodes"]').trigger('click');
    await wrapper.get('[data-action="remove-node"][data-node-id="node-remote"]').trigger('click');
    expect(wrapper.get('[data-modal="remove"]').text()).toContain('node-remote');
    await wrapper.get('[data-modal="remove"]').trigger('click');
    expect(wrapper.find('[data-modal="remove"]').exists()).toBe(true);
    await wrapper.get('[data-close="remove"]').trigger('click');
    expect(wrapper.find('[data-modal="remove"]').exists()).toBe(false);
  });

  it('loads remote preview and renders oplog/credential status without exposing secret material', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.get('[data-testid="rail-section-operations"]').trigger('click');
    expect(wrapper.text()).toContain('ADD_NODE');
    await wrapper.get('[data-testid="rail-section-credentials"]').trigger('click');
    expect(wrapper.text()).toContain('SHA256');
    expect(wrapper.text()).not.toContain('secret');
  });
});
