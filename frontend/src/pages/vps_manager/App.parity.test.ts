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

const state = {
  config: {
    master_name: 'master-local',
    local_user: 'operator',
    swap_options: ['0', '2G'],
    init_methods: ['root', 'user'],
    vps_logging: {
      services: [
        { service: 'PBRun', max_mb: 10, default_max_mb: 10 },
        { service: 'vps_cleanup', max_mb: 2, default_max_mb: 2 },
      ],
      selected_hosts: ['alpha'],
    },
    vps_deploy: {
      action: 'vps-update-pbgui',
      action_text: 'Update PBGui',
      mode: 'serial',
      debug: false,
      reboot_requested: false,
      selected_hosts: ['alpha'],
      actions: [
        { command: 'vps-update-pbgui', command_text: 'Update PBGui' },
        { command: 'vps-update-linux', command_text: 'Update Linux' },
      ],
      modes: ['serial', 'parallel'],
    },
  },
  errors: [],
  overview: {
    rows: [
      {
        hostname: 'master-local', name: 'master-local (local)', nav: 'master', online: true,
        role: 'master', start: '2026-08-18 10:00:00', updates: 2, pbgui: 'v1.95',
        pbgui_branch: 'main (abc)', pb7: 'v7.4', pb7_branch: 'main (def)', pb8: 'v8.1',
        pb8_branch: 'main (ghi)', package_status: { available: true, upgrades: 2 },
      },
      {
        hostname: 'alpha', name: 'alpha', nav: 'vps', online: true, ssh_online: true,
        ssh_host_key_status: 'known', role: 'vps', start: '2026-08-18 10:00:00', updates: 3,
        running_bots: 2, pbgui: 'v1.95', pbgui_branch: 'main (abc)', pb7: 'v7.4',
        pb7_branch: 'main (def)', pb8: 'v8.1', pb8_branch: 'main (ghi)',
        package_status: { available: true, upgrades: 3, packages: ['git', 'python3'] },
        task_status: 'running', task_current_label: 'Pull source', task_progress: { percent: 50 },
      },
    ],
  },
  deploys: { history: [], progress_rows: [] },
};

const detail = {
  kind: 'vps',
  hostname: 'alpha',
  status: {
    online: true, ssh_online: true, ip: '203.0.113.10', latency_ms: 18,
    user: 'bot', install_dir: '/home/bot/software', initialized: true, setup_ready: true,
    package_status: { available: true, upgrades: 3, packages: ['git', 'python3'] },
    systemd_migration: { state: 'ready', required: true },
    cluster_node: { joined: false, state: 'not_joined' },
    server_metrics: { cpu: { value: 20 }, memory: { percent: 35 }, disk: { percent: 42 } },
  },
  config: {
    hostname: 'alpha', ip: '203.0.113.10', user: 'bot', install_dir: '/home/bot/software',
    swap: '2G', firewall: true, firewall_ssh_port: 22, firewall_ssh_ips: '198.51.100.0/24',
    init_methode: 'root', remove_user: false, runtime_profile: 'pb7_pb8',
    secret_status: { user_pw: { present: true }, root_pw: { present: false } },
  },
  branches: {
    pbgui: { current_branch: 'main', current_commit: 'abc123', branches: ['main', 'dev'], commits: [{ hash: 'abc123', subject: 'head' }], remote_url: 'git@example/pbgui.git' },
    pb7: { current_branch: 'main', current_commit: 'def123', branches: { main: [{ full: 'def123', subject: 'head' }] }, known_remotes: ['origin', 'fork'], default_remote_name: 'origin', remote_urls: { origin: 'git@example/passivbot.git' }, upstream_remote_name: 'origin', upstream_remote_url: 'https://example/passivbot.git' },
    pb8: { current_branch: 'main', current_commit: 'ghi123', branches: { main: [{ full: 'ghi123', subject: 'head' }] }, known_remotes: ['origin', 'fork'], default_remote_name: 'origin', remote_urls: { origin: 'git@example/passivbot-rust.git' }, upstream_remote_name: 'origin', upstream_remote_url: 'https://example/passivbot-rust.git' },
  },
  monitor: {
    v7: [{ name: 'v7-bot', status: 'running', cpu: 12, memory_mb: 100, swap_mb: 0, pnl_today: 1.5, errors_today: 1, tracebacks_today: 0, pb_version: '7' }],
    v8: [{ name: 'v8-bot', status: 'running', cpu: 9, memory_mb: 80, swap_mb: 0, pnl_today: 2.5, errors_today: 0, tracebacks_today: 1, pb_version: '8' }],
    v7_running: [], v8_running: [],
  },
  progress: { command: 'vps-update-pbgui', command_text: 'Update PBGui', update_status: 'running', update_log: 'safe <task log>' },
  logfiles: ['PBRun.log', 'PBGui.log'],
  log_preview: { filename: 'PBRun.log', size_kb: 50, content: 'safe <host log>' },
};

function mountApp() { return mount(App, { global: { plugins: [createI18n('en')] } }); }
function lastSent(ws: WebSocketMock): Record<string, unknown> { return JSON.parse(ws.sent.at(-1) || '{}') as Record<string, unknown>; }

async function mountVps() {
  const wrapper = mountApp();
  const ws = WebSocketMock.instances[0]!;
  ws.message({ type: 'state', data: state });
  await wrapper.vm.$nextTick();
  await wrapper.get('[data-action="select-vps"][data-host="alpha"]').trigger('click');
  const generation = Number(lastSent(ws).context_generation || 0);
  ws.message({ type: 'detail', data: detail, context_generation: generation });
  await wrapper.vm.$nextTick();
  return { wrapper, ws };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { __BOOT__: Record<string, unknown> }).__BOOT__ = {
    origin: 'http://test', token: '', version: 'test', serial: '1',
  };
  WebSocketMock.instances = [];
  vi.stubGlobal('WebSocket', WebSocketMock);
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/import/resolve-host?hostname=legacy')) return Promise.resolve({ hostname: 'legacy', ip: '203.0.113.30' });
    if (url.endsWith('/import/probe')) return Promise.resolve({ hostname: 'legacy', ip: '203.0.113.30', checks: { ssh: true }, host_key: { status: 'known' } });
    if (url.endsWith('/import/save')) return Promise.resolve({ saved: true, hostname: 'legacy' });
    if (url.endsWith('/cluster-import/preview')) return Promise.resolve({ items: [{ hostname: 'cluster-a', action: 'add', selected: true }] });
    if (url.endsWith('/cluster-import/apply')) return Promise.resolve({ job_id: 'job-1', status: 'queued' });
    if (url.endsWith('/cluster-import/progress/job-1')) return Promise.resolve({ job_id: 'job-1', status: 'successful', percent: 100, events: [] });
    if (url.endsWith('/cluster-onboard/alpha/active')) return Promise.resolve({ active: false, hostname: 'alpha' });
    if (url.endsWith('/cluster-onboard/alpha/start') && init?.method === 'POST') return Promise.resolve({ job_id: 'onboard-1', status: 'queued' });
    if (url.endsWith('/cluster-onboard/jobs/onboard-1')) return Promise.resolve({ job_id: 'onboard-1', status: 'successful', percent: 100, events: [] });
    if (url.includes('/metric-history/alpha')) return Promise.resolve({ points: [{ ts: 1, value: 10 }] });
    return Promise.resolve({ ok: true });
  });
});

describe('VPS Manager legacy parity', () => {
  it('prompts for the VPS user password before settings reads or remote config apply', async () => {
    const { wrapper, ws } = await mountVps();
    await wrapper.get('[data-action="open-view"][data-view="vps-setup"]').trigger('click');
    await wrapper.get('[data-action="read-vps-settings"]').trigger('click');
    expect(wrapper.find('[data-modal="password"]').exists()).toBe(true);
    await wrapper.get('[data-field="deploy-password"]').setValue('user-secret');
    await wrapper.get('[data-action="password-confirm"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'read_vps_settings', hostname: 'alpha' });
    await wrapper.get('[data-action="open-view"][data-view="vps"]').trigger('click');
    await wrapper.get('[data-action="save-vps-config"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'save_vps_config', hostname: 'alpha' });
  });

  it('provides VPS setup, task logs, host logs, package details, systemd migration, and Cluster onboarding', async () => {
    const { wrapper, ws } = await mountVps();
    await wrapper.get('[data-action="open-view"][data-view="vps-setup"]').trigger('click');
    await wrapper.get('[data-action="read-vps-settings"]').trigger('click');
    if (wrapper.find('[data-modal="password"]').exists()) {
      await wrapper.get('[data-field="deploy-password"]').setValue('user-secret');
      await wrapper.get('[data-action="password-confirm"]').trigger('click');
    }
    expect(lastSent(ws)).toMatchObject({ cmd: 'read_vps_settings', hostname: 'alpha' });
    await wrapper.get('[data-action="preview-systemd-migration"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'preview_vps_systemd_migration', hostname: 'alpha' });
    await wrapper.get('[data-action="open-view"][data-view="vps-task-log"]').trigger('click');
    expect(wrapper.text()).toContain('safe <task log>');
    await wrapper.get('[data-action="open-view"][data-view="vps-host-logs"]').trigger('click');
    await wrapper.get('[data-action="fetch-host-log"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'fetch_vps_log', hostname: 'alpha', filename: 'PBRun.log' });
    await wrapper.get('[data-action="open-package-updates"]').trigger('click');
    expect(wrapper.get('[data-modal="package-updates"]').text()).toContain('python3');
    await wrapper.get('[data-close="package-updates"]').trigger('click');
    await wrapper.get('[data-action="cluster-onboard"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/cluster-onboard/alpha/start'), expect.objectContaining({ method: 'POST' }));
  });

  it('resumes an active Cluster onboarding job when a VPS is opened', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/cluster-onboard/alpha/active')) return Promise.resolve({ active: true, hostname: 'alpha', job_id: 'onboard-active', status: 'running', percent: 40 });
      if (url.endsWith('/cluster-onboard/jobs/onboard-active')) return Promise.resolve({ job_id: 'onboard-active', status: 'successful', percent: 100, events: [] });
      return Promise.resolve({ ok: true });
    });
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: state });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="select-vps"][data-host="alpha"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/cluster-onboard/alpha/active'));
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/cluster-onboard/jobs/onboard-active'));
  });

  it('persists overview selection and sort preferences without storing secrets', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const first = mountApp();
    const firstWs = WebSocketMock.instances[0]!;
    firstWs.message({ type: 'state', data: state });
    await first.vm.$nextTick();
    await first.get('[data-row-host="alpha"]').trigger('click');
    await first.get('[data-sort="hostname"]').trigger('click');
    first.unmount();
    const stored = storage.get('pbgui-vps-manager-overview') || '';
    expect(stored).toContain('alpha');
    expect(stored).not.toContain('secret');
    const second = mountApp();
    const secondWs = WebSocketMock.instances.at(-1)!;
    secondWs.message({ type: 'state', data: state });
    await second.vm.$nextTick();
    expect(second.get('[data-row-host="alpha"]').classes()).toContain('selected');
  });

  it('validates local sudo access before running master Linux actions', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: state });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="open-view"][data-view="master"]').trigger('click');
    const generation = Number(lastSent(ws).context_generation || 0);
    ws.message({ type: 'detail', context_generation: generation, data: { kind: 'master', status: { online: true }, branches: detail.branches, monitor: detail.monitor, progress: { log: 'master log' } } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-action="review-host-key"]').exists()).toBe(false);
    expect(wrapper.find('[data-action="save-vps-config"]').exists()).toBe(false);
    await wrapper.get('[data-action="run-master-update"]').trigger('click');
    expect(wrapper.find('[data-modal="password"]').exists()).toBe(true);
    await wrapper.get('[data-field="deploy-password"]').setValue('sudo-secret');
    await wrapper.get('[data-action="stage-deploy-host"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'validate_local_sudo_password', sudo_pw: 'sudo-secret' });
    ws.message({ type: 'local_sudo_validation_result', data: { ok: true } });
    await wrapper.vm.$nextTick();
    expect(lastSent(ws)).toMatchObject({ cmd: 'run_master_command', command: 'master-update-linux', sudo_pw: 'sudo-secret' });
  });

  it('supports UFW read, pending rules, preview, and explicit apply confirmation', async () => {
    const { wrapper, ws } = await mountVps();
    await wrapper.get('[data-action="open-view"][data-view="vps-ufw"]').trigger('click');
    await wrapper.get('[data-field="ufw-sudo-password"]').setValue('sudo-secret');
    await wrapper.get('[data-action="ufw-read"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'read_ufw_rules', hostname: 'alpha', sudo_pw: 'sudo-secret' });
    ws.message({ type: 'result', cmd: 'read_ufw_rules', success: true, data: { enabled: true, rules: [{ number: 1, to: '22/tcp', action: 'ALLOW', from: '198.51.100.0/24' }], revision: 'r1' } });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-field="ufw-port"]').setValue('443/tcp');
    await wrapper.get('[data-action="ufw-add-rule"]').trigger('click');
    await wrapper.get('[data-action="ufw-preview"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'preview_ufw_rules', hostname: 'alpha' });
    ws.message({ type: 'result', cmd: 'preview_ufw_rules', success: true, data: { preview: { commands: ['ufw allow 443/tcp'] } } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-modal="ufw-preview"]').text()).toContain('ufw allow 443/tcp');
    await wrapper.get('[data-action="ufw-apply-confirm"]').trigger('click');
    await wrapper.get('[data-modal="confirm"] .manager-btn.danger').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'apply_ufw_rules', hostname: 'alpha' });
  });

  it('supports PBGui, PB7, and PB8 remote branch discovery and update actions', async () => {
    const { wrapper, ws } = await mountVps();
    for (const repo of ['pbgui', 'pb7', 'pb8']) {
      await wrapper.get(`[data-action="open-view"][data-view="vps-${repo}-branch"]`).trigger('click');
      await wrapper.get('[data-action="load-remote-branches"]').trigger('click');
      expect(lastSent(ws)).toMatchObject({ cmd: 'load_remote_branches' });
      ws.message({ type: 'remote_branches', request_id: String(lastSent(ws).request_id), remote_url: String(lastSent(ws).remote_url), branches: ['main', 'dev'] });
      await wrapper.vm.$nextTick();
      await wrapper.get('[data-action="load-remote-commits"]').trigger('click');
      expect(lastSent(ws)).toMatchObject({ cmd: 'load_remote_branch_commits', branch: 'main' });
      ws.message({ type: 'remote_branch_commits', request_id: String(lastSent(ws).request_id), remote_url: String(lastSent(ws).remote_url), branch: 'main', commits: [{ hash: 'abc999', subject: 'remote head' }] });
      await wrapper.vm.$nextTick();
      await wrapper.get('[data-action="run-branch-action"]').trigger('click');
      const expectedCommand = repo === 'pbgui' ? 'vps-switch-pbgui-branch' : repo === 'pb7' ? 'vps-switch-pb7-branch' : 'vps-update-pb8';
      const branchVars = repo === 'pbgui' ? { branch: 'main' } : { [`${repo}_branch`]: 'main' };
      expect(lastSent(ws)).toMatchObject({ cmd: 'run_vps_command', hostname: 'alpha', command: expectedCommand, extra_vars: expect.objectContaining(branchVars) });
      if (repo !== 'pbgui') expect(lastSent(ws).extra_vars).toMatchObject({ [`${repo}_source_branch`]: 'main', [`${repo}_remote_name`]: 'origin' });
    }
  });

  it('supports host-key review, secret reveal, config save, remote actions, and bot drill-downs', async () => {
    const { wrapper, ws } = await mountVps();
    await wrapper.get('[data-action="review-host-key"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'probe_vps_host_key', hostname: 'alpha' });
    ws.message({ type: 'result', cmd: 'probe_vps_host_key', success: true, data: { hostname: 'alpha', status: 'unknown', key_type: 'ED25519', fingerprint: 'SHA256:exact' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-modal="host-key"]').text()).toContain('SHA256:exact');
    await wrapper.get('[data-action="trust-host-key"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'trust_vps_host_key', hostname: 'alpha', expected_fingerprint: 'SHA256:exact' });
    await wrapper.get('[data-action="reveal-secret"][data-field="user_pw"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'reveal_secret', hostname: 'alpha', field: 'user_pw' });
    ws.message({ type: 'secret_value', data: { hostname: 'alpha', field: 'user_pw', value: 'temporary-secret' } });
    await wrapper.vm.$nextTick();
    expect((wrapper.get('[data-field="vps-user-password"]').element as HTMLInputElement).value).toBe('temporary-secret');
    await wrapper.get('[data-action="save-vps-config"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'save_vps_config', hostname: 'alpha' });
    await wrapper.get('[data-action="run-vps-command"][data-command="vps-update-linux"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'run_vps_command', hostname: 'alpha', command: 'vps-update-linux' });
    await wrapper.get('[data-action="bot-metric"][data-bot="v7-bot"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'get_metric_history', hostname: 'alpha', bot_name: 'v7-bot' });
    await wrapper.get('[data-action="bot-log-matches"][data-bot="v8-bot"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'fetch_bot_log_matches', hostname: 'alpha', bot_name: 'v8-bot', bucket: 'today' });
  });

  it('keeps VPS initialization gated until required credentials and pre-flight checks are green', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: state });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="open-view"][data-view="add-vps"]').trigger('click');
    await wrapper.get('[data-field="add-hostname"]').setValue('new-vps');
    await wrapper.get('[data-field="add-ip"]').setValue('203.0.113.40');
    await wrapper.get('[data-field="add-user"]').setValue('bot');
    await wrapper.get('[data-field="add-user-password"]').setValue('user-secret');
    await wrapper.get('[data-field="add-initial-root-password"]').setValue('root-secret');
    await wrapper.get('[data-field="add-root-password"]').setValue('new-root-secret');
    expect(wrapper.get('[data-action="init-add-vps"]').attributes('disabled')).toBeDefined();
    ws.message({ type: 'vps_ready_result', data: { hosts_ok: true, ssh_ok: true, host_key: { status: 'known' } } });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-action="init-add-vps"]').attributes('disabled')).toBeUndefined();
  });

  it('requires exact host-key acceptance before retrying an existing VPS import probe', async () => {
    apiFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/import/probe')) return Promise.resolve({ hostname: 'legacy', ip: '203.0.113.30', host_key: { status: 'unknown', key_type: 'ED25519', fingerprint: 'SHA256:import-exact' } });
      return Promise.resolve({ ok: true, init });
    });
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: state });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="open-view"][data-view="add-vps"]').trigger('click');
    await wrapper.get('[data-action="open-existing-import"]').trigger('click');
    await wrapper.get('[data-field="existing-import-hostname"]').setValue('legacy');
    await wrapper.get('[data-action="probe-existing-import"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-modal="existing-import"]').text()).toContain('SHA256:import-exact');
    await wrapper.get('[data-action="accept-existing-host-key"]').trigger('click');
    await flushPromises();
    const probeCalls = apiFetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/import/probe'));
    const body = JSON.parse(String((probeCalls.at(-1)?.[1] as RequestInit | undefined)?.body || '{}')) as Record<string, unknown>;
    expect(body).toMatchObject({ accept_unknown_host: true, accepted_host_key_fingerprint: 'SHA256:import-exact' });
  });

  it('supports existing VPS import and Cluster node import REST workflows', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: state });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="open-view"][data-view="add-vps"]').trigger('click');
    await wrapper.get('[data-action="open-existing-import"]').trigger('click');
    await wrapper.get('[data-field="existing-import-hostname"]').setValue('legacy');
    await wrapper.get('[data-action="resolve-existing-import"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-field="existing-import-ip"]').attributes('value')).toBe('203.0.113.30');
    await wrapper.get('[data-action="probe-existing-import"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/import/probe'), expect.objectContaining({ method: 'POST' }));
    await wrapper.get('[data-action="save-existing-import"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/import/save'), expect.objectContaining({ method: 'POST' }));
    await wrapper.get('[data-close="existing-import"]').trigger('click');
    await wrapper.get('[data-action="open-cluster-import"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-modal="cluster-import"]').text()).toContain('cluster-a');
    await wrapper.get('[data-action="apply-cluster-import"]').trigger('click');
    await flushPromises();
    expect(apiFetchMock).toHaveBeenCalledWith(expect.stringContaining('/cluster-import/apply'), expect.objectContaining({ method: 'POST' }));
  });

  it('retries a staged deployment only after exact unknown-host-key confirmation', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: state });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="open-view"][data-view="deploys-vps-logging"]').trigger('click');
    await wrapper.get('[data-field="deploy-action"]').setValue('vps-update-linux');
    await wrapper.get('[data-action="run-deploy"]').trigger('click');
    await wrapper.get('[data-field="deploy-password"]').setValue('vps-secret');
    await wrapper.get('[data-action="stage-deploy-host"]').trigger('click');
    ws.message({ type: 'confirm_unknown_host_key', cmd: 'validate_and_stage_vps_deploy_host', hostname: 'alpha', ssh_host: '203.0.113.10', fingerprint: 'SHA256:deploy-exact', key_type: 'ED25519' });
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-modal="host-key"]').text()).toContain('SHA256:deploy-exact');
    await wrapper.get('[data-action="trust-host-key"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({
      cmd: 'validate_and_stage_vps_deploy_host', hostname: 'alpha',
      accept_unknown_host: true, accepted_host_key_fingerprint: 'SHA256:deploy-exact',
    });
  });

  it('opens host and deployment logs through the shared LogViewerPanel', async () => {
    const calls: Array<[string, string?]> = [];
    class ViewerMock {
      constructor(public options: Record<string, unknown>) { calls.push(['construct', String(options.containerId || '')]); }
      open(): void { calls.push(['open']); }
      close(): void { calls.push(['close']); }
      setHost(host: string): void { calls.push(['host', host]); }
      setFile(file: string): void { calls.push(['file', file]); }
    }
    (window as unknown as { LogViewerPanel: typeof ViewerMock }).LogViewerPanel = ViewerMock;
    const withHistory = structuredClone(state) as Record<string, any>;
    withHistory.deploys.history = [{ id: 'deploy-1', started_at: '2026-08-18', command: 'vps-update-pbgui', command_text: 'Update PBGui', hostnames: ['alpha'], host_logs: { alpha: { file_alias: 'VPSAction:alpha:vps-update-pbgui', status: 'running' } } }];
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: withHistory });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="open-view"][data-view="deploys-vps-logging"]').trigger('click');
    await wrapper.get('[data-action="open-deploy-log"]').trigger('click');
    await flushPromises();
    expect(calls).toContainEqual(['host', 'alpha']);
    expect(calls).toContainEqual(['file', 'VPSAction:alpha:vps-update-pbgui']);
    wrapper.unmount();
    delete (window as unknown as { LogViewerPanel?: typeof ViewerMock }).LogViewerPanel;
  });

  it('persists logging/deploy settings and stages password-gated bulk deployments', async () => {
    const wrapper = mountApp();
    const ws = WebSocketMock.instances[0]!;
    ws.message({ type: 'state', data: state });
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-action="open-view"][data-view="settings-vps-logging"]').trigger('click');
    await wrapper.get('[data-field="logging-limit-PBRun"]').setValue('12');
    await wrapper.get('[data-action="save-logging-settings"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'save_vps_logging_config' });
    await wrapper.get('[data-action="deploy-logging"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'deploy_vps_logging', hostnames: ['alpha'] });
    await wrapper.get('[data-action="open-view"][data-view="deploys-vps-logging"]').trigger('click');
    await wrapper.get('[data-field="deploy-action"]').setValue('vps-update-linux');
    await wrapper.get('[data-action="run-deploy"]').trigger('click');
    expect(wrapper.find('[data-modal="deploy-password"]').exists()).toBe(true);
    await wrapper.get('[data-field="deploy-password"]').setValue('vps-secret');
    await wrapper.get('[data-action="stage-deploy-host"]').trigger('click');
    expect(lastSent(ws)).toMatchObject({ cmd: 'validate_and_stage_vps_deploy_host', hostname: 'alpha', password: 'vps-secret' });
    ws.message({ type: 'result', cmd: 'validate_and_stage_vps_deploy_host', success: true, data: { entry_id: 'entry-1', hostname: 'alpha', staged: true, remaining_hosts: [] } });
    await wrapper.vm.$nextTick();
    expect(lastSent(ws)).toMatchObject({ cmd: 'finalize_vps_deploy_session', entry_id: 'entry-1' });
  });
});
