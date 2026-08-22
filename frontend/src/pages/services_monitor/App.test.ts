import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ApiError, apiFetch } from '@/shared/api';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';
import { apiBase, wsBase } from './config';
import type { ServiceStatusMap } from './types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

vi.mock('@/shared/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public detail: string) {
      super(`API ${status}: ${detail}`);
    }
  },
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

/** Sidebar panels in legacy frontend/services_monitor.html order. */
const PANEL_IDS = [
  'overview',
  'workers',
  'migration',
  'pbcluster',
  'pbrun',
  'pbdata',
  'pbcoindata',
  'monitor-agent',
  'vps-monitor',
  'api-server',
] as const;

const STATUS_PAYLOAD: ServiceStatusMap = {
  pbcluster: { running: true },
  pbrun: { running: false },
  'api-server': { running: true },
};

/** Realistic GET /migration/status payload used by the wiring tests. */
const MIGRATION_PAYLOAD = {
  migration_needed: true,
  user: 'quran',
  uid: 501,
  pbgui_dir: '/opt/pbgui',
  pbgui_python: '/usr/bin/python3',
  systemd_unit_dir: '/home/quran/.config/systemd/user',
  pb7dir: '',
  warnings: [],
  missing_default_units: [],
  not_ready_default_units: [],
  systemd_units: [],
  legacy_crontab: { entries: [] },
  legacy_start_sh: { exists: false },
  processes: [],
};

function statusApi(): void {
  apiFetchMock.mockImplementation(async (url: string) =>
    String(url).endsWith('/workers/status')
      ? { counts: { total: 4, running: 3 }, groups: [] }
      : String(url).endsWith('/migration/status')
        ? MIGRATION_PAYLOAD
        : String(url).endsWith('/status')
          ? STATUS_PAYLOAD
          : {}
  );
}

function mountApp(lang: 'en' | 'zh' = 'en') {
  return mount(App, { global: { plugins: [createI18n(lang)] } });
}

beforeEach(() => {
  window.location.hash = '';
  statusApi();
});

afterEach(() => {
  window.location.hash = '';
  document.getElementById('result-modal')?.remove();
});

describe('services_monitor App skeleton', () => {
  it('renders the shared shell and the page-body layout container', () => {
    const wrapper = mountApp();

    expect(wrapper.find('.app-shell').exists()).toBe(true);
    expect(wrapper.find('#topnav').exists()).toBe(false);
    expect(wrapper.find('#page-body').exists()).toBe(true);
    expect(wrapper.find('#sidebar').exists()).toBe(true);
    expect(wrapper.findAll('main#app-shell-main')).toHaveLength(1);
    expect(wrapper.find('#services-main-content').exists()).toBe(true);
    expect(wrapper.get('.workspace-header__actions button').find('svg').exists()).toBe(true);
  });

  it('renders one sidebar button and panel container per legacy panel', () => {
    const wrapper = mountApp();

    const buttons = wrapper.findAll('.sb-btn');
    expect(buttons).toHaveLength(PANEL_IDS.length);
    for (const id of PANEL_IDS) {
      expect(wrapper.find(`#panel-${id}`).exists(), `panel ${id} container`).toBe(true);
    }
    // The overview, workers and migration panels are live since Tasks 9/10/14;
    // the multi-tab services render their real ctrl strips too.
    expect(wrapper.find('#panel-overview .panel-placeholder').exists()).toBe(false);
    expect(wrapper.find('#panel-workers .workers-shell').exists()).toBe(true);
    expect(wrapper.find('#panel-migration .ctrl-strip').exists()).toBe(true);
    expect(wrapper.find('#panel-migration #migration-wrap').exists()).toBe(true);
  });

  it('shows the overview panel as active by default', () => {
    const wrapper = mountApp();

    const active = wrapper.find('.svc-panel.active');
    expect(active.attributes('id')).toBe('panel-overview');
    expect(wrapper.find('.sb-btn.active').attributes('data-panel')).toBe('overview');
  });

  it('switches the active panel on sidebar click and persists it in the hash', async () => {
    const wrapper = mountApp();

    await wrapper.find('.sb-btn[data-panel="workers"]').trigger('click');

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-workers');
    expect(window.location.hash).toBe('#workers');
  });

  it('ignores hash panel ids that do not exist', () => {
    window.location.hash = '#no-such-panel';
    const wrapper = mountApp();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-overview');
  });

  it('restores the active panel from the location hash', () => {
    window.location.hash = '#migration';
    const wrapper = mountApp();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-migration');
  });

  it('sets the document title from i18n', () => {
    mountApp();

    expect(document.title).toBe('Services - PBGui');
  });

  it('renders localized sidebar labels', () => {
    const wrapper = mountApp('zh');

    expect(wrapper.find('.sb-btn[data-panel="overview"]').text()).toContain('概览');
    expect(wrapper.find('.sb-btn[data-panel="workers"]').text()).toContain('工作节点');
    // Panels the legacy page left untranslated stay as brand names.
    expect(wrapper.find('.sb-btn[data-panel="pbcluster"]').text()).toContain('PBCluster');
  });

  it('renders loading and polling failure status copy as text', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/status')) throw new Error('status unavailable');
      if (String(url).endsWith('/workers/status')) return { counts: { total: 0, running: 0 }, groups: [] };
      if (String(url).endsWith('/migration/status')) return MIGRATION_PAYLOAD;
      return {};
    });
    const wrapper = mountApp();
    expect(wrapper.get('[role="status"]').text()).toContain('Loading');

    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain('Error');
    expect(wrapper.get('[role="status"]').attributes('data-tone')).toBe('danger');
  });
});

describe('services_monitor overview panel', () => {
  it('polls /status on mount and renders the cards from the payload', async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/status');
    expect(wrapper.findAll('#panel-overview .svc-card')).toHaveLength(9);
    expect(wrapper.find('#panel-overview .svc-card[data-svc="pbcluster"] .card-status-row').text()).toBe('Running');
    expect(wrapper.find('#panel-overview .svc-card[data-svc="pbrun"] .card-status-row').text()).toBe('Stopped');

    // Sidebar dots follow the payload (legacy updateStatusUI); overview has no dot.
    expect(wrapper.find('.sb-btn[data-panel="pbcluster"] .sb-dot').classes()).toContain('running');
    expect(wrapper.find('.sb-btn[data-panel="pbrun"] .sb-dot').classes()).toContain('stopped');
    expect(wrapper.find('.sb-btn[data-panel="overview"] .sb-dot').exists()).toBe(false);
  });

  it('POSTs the legacy action endpoint and refreshes status on button click', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('#panel-overview .svc-card[data-svc="pbrun"] .card-btn.start').trigger('click');
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/pbrun/start', {
      method: 'POST',
    });
    // Legacy svcAction triggers an immediate status refresh after the action.
    expect(
      apiFetchMock.mock.calls.some(([url]) => url === 'http://pbgui.test:8000/api/services/status')
    ).toBe(true);
  });

  it('updates the status card in place when the action response carries running', async () => {
    let started = false;
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/pbrun/start')) {
        started = true;
        return { running: true };
      }
      // /status reflects the started service once the action has gone through.
      return String(url).endsWith('/status')
        ? started
          ? { ...STATUS_PAYLOAD, pbrun: { running: true } }
          : STATUS_PAYLOAD
        : {};
    });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#panel-overview .svc-card[data-svc="pbrun"] .card-btn.start').trigger('click');
    await flushPromises();

    expect(wrapper.find('#panel-overview .svc-card[data-svc="pbrun"] .card-status-row').text()).toBe('Running');
  });

  it('shows the restart-requested popup after a successful restart', async () => {
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#panel-overview .svc-card[data-svc="pbcluster"] .card-btn.restart').trigger('click');
    await flushPromises();

    const modal = document.getElementById('result-modal');
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain('Service restart requested');
    expect(modal!.textContent).toContain('pbcluster restart requested successfully.');
    // Legacy passes hideFoot=false: the OK footer button is rendered.
    expect(modal!.querySelector('.result-modal-footer button')).not.toBeNull();
  });

  it('shows the failure popup and re-enables buttons when an action is rejected', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/pbrun/start')) throw new ApiError(500, 'pbrun exploded');
      return String(url).endsWith('/status') ? STATUS_PAYLOAD : {};
    });
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('#panel-overview .svc-card[data-svc="pbrun"] .card-btn.start').trigger('click');
    await flushPromises();

    const modal = document.getElementById('result-modal');
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain('Service action failed');
    expect(modal!.textContent).toContain('Could not start pbrun.');
    expect(
      wrapper.find('#panel-overview .svc-card[data-svc="pbrun"] .card-btn.start').attributes('disabled')
    ).toBeUndefined();
  });

  it('routes the api-server restart through the legacy restart endpoint', async () => {
    const overlayCalls: Array<[string, string]> = [];
    (window as { showRestartOverlay?: unknown }).showRestartOverlay = (origin: string, token: string) => {
      overlayCalls.push([origin, token]);
    };
    try {
      const wrapper = mountApp();
      await flushPromises();

      await wrapper.find('#panel-overview .svc-card[data-svc="api-server"] .card-btn.restart').trigger('click');
      await flushPromises();

      expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/api-server/restart', {
        method: 'POST',
      });
      expect(overlayCalls).toEqual([['http://pbgui.test:8000', 'tok']]);
    } finally {
      delete (window as { showRestartOverlay?: unknown }).showRestartOverlay;
    }
  });
});

describe('services_monitor workers wiring', () => {
  it('fetches worker status once on mount and feeds the overview card', async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/workers/status');
    const workersCard = wrapper.findAll('#panel-overview .svc-card').find((c) => c.attributes('data-svc') === 'workers')!;
    expect(workersCard.find('.card-status-row').text()).toBe('3 / 4 running');
    // Worker groups drive the panel list.
    expect(wrapper.find('#panel-workers .worker-detail-empty').text()).toContain('No workers available.');
  });

  it('polls worker status every 5s only while the workers panel is active', async () => {
    vi.useFakeTimers();
    const workerCalls = () => apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/workers/status')).length;
    try {
      const wrapper = mountApp();
      await flushPromises();

      vi.advanceTimersByTime(10_000);
      await flushPromises();
      const baseline = workerCalls();
      expect(baseline).toBeGreaterThanOrEqual(1); // legacy single fetchWorkers(false) on load
      expect(workerCalls()).toBe(baseline); // no polling from other panels (legacy scheduleWorkers)

      await wrapper.find('.sb-btn[data-panel="workers"]').trigger('click');
      await flushPromises();
      vi.advanceTimersByTime(10_000);
      await flushPromises();
      expect(workerCalls()).toBeGreaterThan(baseline);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the worker list in the panel from the polled payload', async () => {
    apiFetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/workers/status')
        ? {
            counts: { total: 1, running: 1 },
            groups: [{ id: 'g', label: 'Group', items: [{ id: 'w1', label: 'Frontend', running: true, log_file: 'logs/frontend.log' }] }],
          }
        : String(url).endsWith('/status')
          ? STATUS_PAYLOAD
          : {}
    );
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#panel-workers .worker-group-title').text()).toBe('Group');
    expect(wrapper.find('#panel-workers .card-name').text()).toBe('Frontend');
  });
});

describe('services_monitor service log wiring', () => {
  it('renders the legacy ctrl strip and log container for the log-only panels', () => {
    const wrapper = mountApp();

    expect(wrapper.find('#panel-pbcluster .ctrl-strip').exists()).toBe(true);
    expect(wrapper.find('#panel-pbcluster .ctrl-title').text()).toBe('PBCluster');
    // Panel not active -> no log viewer yet (legacy initLogViewer on selectPanel).
    expect(wrapper.find('#panel-pbcluster .logviewer').exists()).toBe(false);
  });

  it('renders the legacy tab bar for the multi-tab services', () => {
    const wrapper = mountApp();

    const tabs = wrapper.findAll('#panel-pbdata .tab-btn');
    expect(tabs.map((button) => button.text())).toEqual(['Log', 'Settings', 'Status']);
    expect(tabs.every((button) => button.find('svg').exists())).toBe(true);
    expect(wrapper.findAll('#panel-api-server .tab-btn').map((button) => button.text())).toEqual(['Log', 'Settings']);
    expect(wrapper.findAll('#panel-pbcoindata .tab-btn').map((button) => button.text())).toEqual(['Log', 'Pool', 'Settings']);
  });

  it('emits service actions from the panel ctrl strip through App', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('#panel-pbrun .ctrl-btn.start').trigger('click');
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/pbrun/start', {
      method: 'POST',
    });
  });
});

describe('services_monitor cmc pool wiring', () => {
  const fetchMock = vi.fn();

  const CMC_POOL = {
    keys: [{ id: 'k1', label: 'Primary', active: true, generation: 3 }],
    ready: true,
    active_credentials: 1,
    total_credentials: 1,
    health: 'ok',
    day: '2026-08-15',
    soft_credit_limit: 1000,
    eligible_authority_nodes: [],
  };
  const CMC_LEASES = { authority: { available: true, active_leases: 2, lease_count: 5 }, key_usage: [], domains: [], leases: [], warnings: [] };

  function cmcResponse(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, statusText: 'Err', json: async () => body } as Response;
  }

  const cmcPoolLoads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/cmc-pool')).length;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/cmc-pool/leases') ? cmcResponse(CMC_LEASES) : cmcResponse(CMC_POOL));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the pool panel in the pbcoindata pool tab and stays idle until activation', async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#panel-pbcoindata .cmc-pool-wrap').exists()).toBe(true);
    // The panel is mounted but hidden behind the log tab; no legacy load until selectPanel.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('#panel-pbcoindata .cmc-table-wrap').text()).toContain('Loading pool');
  });

  it('loads the pool and leases when the pbcoindata panel is activated', async () => {
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('.sb-btn[data-panel="pbcoindata"]').trigger('click');
    await flushPromises();

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toContain('http://pbgui.test:8000/api/services/cmc-pool');
    expect(urls).toContain('http://pbgui.test:8000/api/services/cmc-pool/leases');
    expect(cmcPoolLoads()).toBe(1);
    // Legacy markup: the status bar sits between the ctrl strip and the tab bar
    // (visible on every pbcoindata tab, not just the pool tab).
    const bar = wrapper.find('#panel-pbcoindata .cmc-status-bar');
    expect((bar.element.previousElementSibling as HTMLElement | null)?.className).toContain('ctrl-strip');
    expect((bar.element.nextElementSibling as HTMLElement | null)?.className).toContain('tab-bar');
    expect(wrapper.find('#panel-pbcoindata .cmc-status-text').text()).toBe('CMC pool ready: 1 active, health ok, generation 3');
    expect(wrapper.find('#panel-pbcoindata .cmc-pool-message').text()).toBe('5 lease records');
  });

  it('reloads when switching to the pool tab (legacy switchTab)', async () => {
    const wrapper = mountApp();
    await flushPromises();
    await wrapper.find('.sb-btn[data-panel="pbcoindata"]').trigger('click');
    await flushPromises();
    expect(cmcPoolLoads()).toBe(1);

    const poolTab = wrapper.findAll('#panel-pbcoindata .tab-btn').find((b) => b.attributes('data-tab') === 'pool')!;
    await poolTab.trigger('click');
    await flushPromises();

    expect(window.location.hash).toBe('#pbcoindata/pool');
    expect(cmcPoolLoads()).toBe(2);
  });

  it('restores #pbcoindata/pool from the hash and loads once on mount', async () => {
    window.location.hash = '#pbcoindata/pool';
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-pbcoindata');
    expect(wrapper.find('#panel-pbcoindata .tab-btn[data-tab="pool"]').classes()).toContain('active');
    expect(cmcPoolLoads()).toBe(1);
  });

  it('shows the unavailable status bar and error message when the load fails', async () => {
    fetchMock.mockImplementation(async () => cmcResponse({ detail: 'pool down' }, 503));
    const wrapper = mountApp();

    await wrapper.find('.sb-btn[data-panel="pbcoindata"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('#panel-pbcoindata .cmc-status-bar').classes()).toContain('error');
    expect(wrapper.find('#panel-pbcoindata .cmc-status-text').text()).toBe('CMC pool unavailable: pool down');
    expect(wrapper.find('#panel-pbcoindata .cmc-pool-message').classes()).toContain('error');
    expect(wrapper.find('#panel-pbcoindata .cmc-pool-message').text()).toBe('pool down');
  });
});

describe('services_monitor pbdata settings wiring', () => {
  const SETTINGS_PAYLOAD = {
    all_users: ['alice', 'bob'],
    fetch_users: ['alice'],
    trades_users: [],
    log_level: 'INFO',
    ws_max: 10,
    pollers_delay_seconds: 60,
    poll_interval_combined_seconds: 90,
    poll_interval_balance_seconds: 300,
    poll_interval_positions_seconds: 300,
    poll_interval_orders_seconds: 60,
    poll_interval_history_seconds: 300,
    poll_interval_executions_seconds: 1800,
    shared_rest_user_pause_seconds: 0.75,
    shared_rest_pause_by_exchange: {},
    latest_1m_coin_pause_seconds: 2,
  };

  const settingsCalls = () =>
    apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/settings/pbdata'));

  function settingsApi(): void {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/settings/pbdata')) return SETTINGS_PAYLOAD;
      return String(url).endsWith('/workers/status')
        ? { counts: { total: 4, running: 3 }, groups: [] }
        : String(url).endsWith('/status')
          ? STATUS_PAYLOAD
          : {};
    });
  }

  /** The pbdata settings tab button (log → settings → status order). */
  async function openSettingsTab(wrapper: ReturnType<typeof mountApp>) {
    await wrapper.find('.sb-btn[data-panel="pbdata"]').trigger('click');
    const tab = wrapper.findAll('#panel-pbdata .tab-btn').find((b) => b.attributes('data-tab') === 'settings')!;
    await tab.trigger('click');
  }

  it('loads GET /settings/pbdata on first settings tab activation and renders the form', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await openSettingsTab(wrapper);
    await flushPromises();

    expect(settingsCalls()).toHaveLength(1);
    expect(settingsCalls()[0]![0]).toBe('http://pbgui.test:8000/api/services/settings/pbdata');
    expect(wrapper.find('#panel-pbdata #pbdata-settings-wrap').exists()).toBe(true);
    expect(wrapper.findAll('#panel-pbdata .form-section-title').map((s) => s.text())).toEqual([
      'Users',
      'Log Level',
      'Timers',
    ]);
  });

  it('shows the loading placeholder until the settings load resolves', async () => {
    apiFetchMock.mockImplementation(
      async (url: string) =>
        String(url).endsWith('/settings/pbdata')
          ? new Promise(() => {}) // never resolves
          : String(url).endsWith('/status')
            ? STATUS_PAYLOAD
            : {}
    );
    const wrapper = mountApp();
    await flushPromises();

    await openSettingsTab(wrapper);
    await flushPromises();

    expect(wrapper.find('#panel-pbdata #pbdata-settings-wrap').text()).toBe('Loading settings…');
  });

  it('does not reload settings on repeated settings tab activation (legacy _settingsLoaded)', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await openSettingsTab(wrapper);
    await flushPromises();
    await openSettingsTab(wrapper);
    await flushPromises();
    const logTab = wrapper.findAll('#panel-pbdata .tab-btn').find((b) => b.attributes('data-tab') === 'log')!;
    await logTab.trigger('click');
    await openSettingsTab(wrapper);
    await flushPromises();

    expect(settingsCalls()).toHaveLength(1);
  });

  it('loads once on mount when restored from #pbdata/settings (legacy restoreFromHash)', async () => {
    settingsApi();
    window.location.hash = '#pbdata/settings';
    apiFetchMock.mockClear(); // the load fires during mount
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-pbdata');
    expect(wrapper.find('#panel-pbdata .tab-btn[data-tab="settings"]').classes()).toContain('active');
    expect(settingsCalls()).toHaveLength(1);
    expect(wrapper.find('#panel-pbdata #pbdata-log-level').exists()).toBe(true);
  });

  it('does not load settings when only the log tab is opened', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('.sb-btn[data-panel="pbdata"]').trigger('click');
    await flushPromises();

    expect(settingsCalls()).toHaveLength(0);
    expect(wrapper.find('#panel-pbdata #pbdata-settings-wrap').text()).toBe('Loading settings…');
  });
});

describe('services_monitor apiserver settings wiring', () => {
  const SETTINGS_PAYLOAD = {
    host: '10.0.0.5',
    port: 8123,
    auto_restart: true,
    available_hosts: ['vps1.example.com'],
    enabled_hosts: ['vps1.example.com'],
    monitor_config: { mem_warning_server: 80 },
    telegram_token: 'tok',
    telegram_chat_id: '-100',
    service_gui: false,
  };

  const settingsCalls = () =>
    apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/settings/api-server'));

  function settingsApi(): void {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/settings/api-server')) return SETTINGS_PAYLOAD;
      return String(url).endsWith('/workers/status')
        ? { counts: { total: 4, running: 3 }, groups: [] }
        : String(url).endsWith('/status')
          ? STATUS_PAYLOAD
          : {};
    });
  }

  /** The api-server settings tab button (log → settings order). */
  async function openSettingsTab(wrapper: ReturnType<typeof mountApp>) {
    await wrapper.find('.sb-btn[data-panel="api-server"]').trigger('click');
    const tab = wrapper.findAll('#panel-api-server .tab-btn').find((b) => b.attributes('data-tab') === 'settings')!;
    await tab.trigger('click');
  }

  it('loads GET /settings/api-server on first settings tab activation and renders the form', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await openSettingsTab(wrapper);
    await flushPromises();

    expect(settingsCalls()).toHaveLength(1);
    expect(settingsCalls()[0]![0]).toBe('http://pbgui.test:8000/api/services/settings/api-server');
    expect(wrapper.find('#panel-api-server #apiserver-settings-wrap').exists()).toBe(true);
    expect(wrapper.findAll('#panel-api-server .form-section-title').map((s) => s.text())).toEqual([
      'Connection',
      'VPS Monitoring',
      'Alerts / Telegram',
    ]);
    expect((wrapper.find('#panel-api-server #apiserver-host').element as HTMLInputElement).value).toBe('10.0.0.5');
    expect(wrapper.find('#panel-api-server #service_gui').exists()).toBe(true);
  });

  it('shows the loading placeholder until the settings load resolves', async () => {
    apiFetchMock.mockImplementation(
      async (url: string) =>
        String(url).endsWith('/settings/api-server')
          ? new Promise(() => {}) // never resolves
          : String(url).endsWith('/status')
            ? STATUS_PAYLOAD
            : {}
    );
    const wrapper = mountApp();
    await flushPromises();

    await openSettingsTab(wrapper);
    await flushPromises();

    expect(wrapper.find('#panel-api-server #apiserver-settings-wrap').text()).toBe('Loading settings…');
  });

  it('does not reload settings on repeated settings tab activation (legacy _settingsLoaded)', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await openSettingsTab(wrapper);
    await flushPromises();
    await openSettingsTab(wrapper);
    await flushPromises();

    expect(settingsCalls()).toHaveLength(1);
  });

  it('loads once on mount when restored from #api-server/settings (legacy restoreFromHash)', async () => {
    settingsApi();
    window.location.hash = '#api-server/settings';
    apiFetchMock.mockClear(); // the load fires during mount
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-api-server');
    expect(wrapper.find('#panel-api-server .tab-btn[data-tab="settings"]').classes()).toContain('active');
    expect(settingsCalls()).toHaveLength(1);
    expect(wrapper.find('#panel-api-server #apiserver-port').exists()).toBe(true);
  });

  it('does not load settings when only the log tab is opened', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('.sb-btn[data-panel="api-server"]').trigger('click');
    await flushPromises();

    expect(settingsCalls()).toHaveLength(0);
    expect(wrapper.find('#panel-api-server #apiserver-settings-wrap').text()).toBe('Loading settings…');
  });
});

describe('services_monitor pbcoindata settings wiring', () => {
  const SETTINGS_PAYLOAD = {
    fetch_interval: 6,
    fetch_limit: 2000,
    metadata_interval: 3,
    mapping_interval: 48,
  };

  const settingsCalls = () =>
    apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/settings/pbcoindata'));

  /** pbcoindata activation also fires the CMC pool loads through global fetch. */
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) } as Response));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function settingsApi(): void {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/settings/pbcoindata')) return SETTINGS_PAYLOAD;
      return String(url).endsWith('/workers/status')
        ? { counts: { total: 4, running: 3 }, groups: [] }
        : String(url).endsWith('/status')
          ? STATUS_PAYLOAD
          : {}
    });
  }

  /** The pbcoindata settings tab button (log → pool → settings order). */
  async function openSettingsTab(wrapper: ReturnType<typeof mountApp>) {
    await wrapper.find('.sb-btn[data-panel="pbcoindata"]').trigger('click');
    const tab = wrapper.findAll('#panel-pbcoindata .tab-btn').find((b) => b.attributes('data-tab') === 'settings')!;
    await tab.trigger('click');
  }

  it('loads GET /settings/pbcoindata on first settings tab activation and renders the form', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await openSettingsTab(wrapper);
    await flushPromises();

    expect(settingsCalls()).toHaveLength(1);
    expect(settingsCalls()[0]![0]).toBe('http://pbgui.test:8000/api/services/settings/pbcoindata');
    expect(wrapper.find('#panel-pbcoindata #coindata-settings-wrap').exists()).toBe(true);
    expect(wrapper.find('#panel-pbcoindata #coindata-settings-wrap .form-section-title').text()).toBe('Intervals');
    expect((wrapper.find('#panel-pbcoindata #coindata-fetch-interval').element as HTMLInputElement).value).toBe('6');
  });

  it('does not reload settings on repeated settings tab activation (legacy _settingsLoaded)', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await openSettingsTab(wrapper);
    await flushPromises();
    // switch away to pool and back to settings
    const poolTab = wrapper.findAll('#panel-pbcoindata .tab-btn').find((b) => b.attributes('data-tab') === 'pool')!;
    await poolTab.trigger('click');
    await openSettingsTab(wrapper);
    await flushPromises();

    expect(settingsCalls()).toHaveLength(1);
  });

  it('loads once on mount when restored from #pbcoindata/settings (legacy restoreFromHash)', async () => {
    settingsApi();
    window.location.hash = '#pbcoindata/settings';
    apiFetchMock.mockClear(); // the load fires during mount
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('.svc-panel.active').attributes('id')).toBe('panel-pbcoindata');
    expect(wrapper.find('#panel-pbcoindata .tab-btn[data-tab="settings"]').classes()).toContain('active');
    expect(settingsCalls()).toHaveLength(1);
    expect(wrapper.find('#panel-pbcoindata #coindata-fetch-limit').exists()).toBe(true);
  });

  it('does not load settings when only the pool tab is opened', async () => {
    settingsApi();
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('.sb-btn[data-panel="pbcoindata"]').trigger('click');
    await flushPromises();

    expect(settingsCalls()).toHaveLength(0);
    expect(wrapper.find('#panel-pbcoindata #coindata-settings-wrap').text()).toBe('Loading settings…');
  });
});

describe('services_monitor config', () => {
  it('derives the services API base from the boot origin', () => {
    expect(apiBase()).toBe('http://pbgui.test:8000/api/services');
  });

  it('derives the websocket base from the boot origin', () => {
    expect(wsBase()).toBe('ws://pbgui.test:8000');
  });
});

describe('services_monitor migration wiring (legacy loadMigrationStatus/testSystemdMigration/runSystemdMigration)', () => {
  type DialogsGlobal = typeof globalThis & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } };

  const migrationCalls = () => apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/migration/status'));
  const statusCalls = () => apiFetchMock.mock.calls.filter(([url]) => String(url).endsWith('/status'));

  beforeEach(() => {
    (window as DialogsGlobal).PBGuiDialogs = { confirm: vi.fn(async () => true) };
  });

  afterEach(() => {
    delete (window as DialogsGlobal).PBGuiDialogs;
  });

  it('loads the migration status once on mount (legacy init loadMigrationStatus(false))', async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(migrationCalls()).toHaveLength(1);
    expect(wrapper.find('#panel-migration .migration-title').text()).toBe('Systemd user services migration');
    expect(wrapper.find('.sb-btn[data-panel="migration"] .sb-dot').classes()).toContain('warn');
  });

  it('force-loads the migration status when the migration panel is selected', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('.sb-btn[data-panel="migration"]').trigger('click');
    await flushPromises();

    expect(migrationCalls()).toHaveLength(1);
  });

  it('reloads the migration status from the ctrl-strip refresh button', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('#panel-migration .ctrl-btn').trigger('click');
    await flushPromises();

    expect(migrationCalls()).toHaveLength(1);
  });

  it('renders the error card when the status fetch fails (legacy _error payload)', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/migration/status')) throw new ApiError(503, 'api is restarting');
      if (String(url).endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
      return STATUS_PAYLOAD;
    });
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('#panel-migration .migration-warn').text()).toBe(
      'Failed to load migration status: api is restarting'
    );
  });

  it('runs the dry-run flow from the test button with the legacy popup and log prefixes', async () => {
    const wrapper = mountApp();
    await flushPromises();
    let releaseTest!: (r: unknown) => void;
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/migration/test')) {
        return new Promise((resolve) => (releaseTest = resolve));
      }
      if (String(url).endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
      if (String(url).endsWith('/migration/status')) return MIGRATION_PAYLOAD;
      return STATUS_PAYLOAD;
    });

    await wrapper.find('#panel-migration #migration-test-btn').trigger('click');
    await flushPromises();
    // Legacy button swap: disabled with the testing label while in flight.
    const busyBtn = wrapper.find('#panel-migration #migration-test-btn');
    expect((busyBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(busyBtn.text()).toBe('Testing...');

    releaseTest({ ok: true, warnings: ['legacy ini found'], errors: [], logs: ['would install units'] });
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/migration/test', {
      method: 'POST',
    });
    const modal = document.getElementById('result-modal')!;
    expect(modal.textContent).toContain('Dry-run completed');
    expect(modal.textContent).toContain('WARNING: legacy ini found');
    expect(modal.textContent).toContain('would install units');
    expect(wrapper.find('#panel-migration #migration-test-btn').text()).toBe('Test migration');
  });

  it('shows the failed popup for a dry run that found blockers', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/migration/test')) {
        return { ok: false, warnings: [], errors: ['missing unit'], logs: [] };
      }
      if (String(url).endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
      if (String(url).endsWith('/migration/status')) return MIGRATION_PAYLOAD;
      return STATUS_PAYLOAD;
    });

    await wrapper.find('#panel-migration #migration-test-btn').trigger('click');
    await flushPromises();

    const modal = document.getElementById('result-modal')!;
    expect(modal.textContent).toContain('Dry-run found blockers');
    expect(modal.textContent).toContain('ERROR: missing unit');
  });

  it('runs the migration behind the confirm dialog and marks the restart pending', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/migration/run')) {
        return {
          ok: true,
          warnings: ['restart scheduled'],
          logs: ['enabled units'],
          api_restart: true,
          after: { ...MIGRATION_PAYLOAD, migration_needed: false },
        };
      }
      if (String(url).endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
      if (String(url).endsWith('/migration/status')) return MIGRATION_PAYLOAD;
      return STATUS_PAYLOAD;
    });

    await wrapper.find('#panel-migration #migration-run-btn').trigger('click');
    await flushPromises();

    expect((window as DialogsGlobal).PBGuiDialogs!.confirm).toHaveBeenCalledWith({
      title: 'Migrate to systemd',
      message: 'Migrate this master to systemd user services now? PBGui daemons and the API server will restart after the migration.',
      confirmText: 'Migrate',
    });
    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/migration/run', {
      method: 'POST',
    });
    // after payload with migration_needed: false → run button disabled again.
    expect((wrapper.find('#panel-migration #migration-run-btn').element as HTMLButtonElement).disabled).toBe(true);
    // _restart_pending → warn meta on the sidebar dot and the retry banner in preflight.
    expect(wrapper.find('.sb-btn[data-panel="migration"] .sb-dot').classes()).toContain('warn');
    expect(wrapper.find('#panel-migration .migration-ok').text()).toContain('Migration completed. API restart is in progress');
    const modal = document.getElementById('result-modal')!;
    expect(modal.textContent).toContain('Migration completed');
    expect(modal.textContent).toContain('WARNING: restart scheduled');
  });

  it('does not POST /migration/run when the confirm dialog is declined', async () => {
    (window as DialogsGlobal).PBGuiDialogs!.confirm.mockResolvedValue(false);
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('#panel-migration #migration-run-btn').trigger('click');
    await flushPromises();

    expect(apiFetchMock.mock.calls.some(([url]) => String(url).endsWith('/migration/run'))).toBe(false);
  });

  it('falls back to the blocked popup when PBGuiDialogs is unavailable', async () => {
    delete (window as DialogsGlobal).PBGuiDialogs;
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('#panel-migration #migration-run-btn').trigger('click');
    await flushPromises();

    const modal = document.getElementById('result-modal')!;
    expect(modal.textContent).toContain('Migration blocked');
    expect(modal.textContent).toContain('Confirmation dialog is unavailable.');
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).endsWith('/migration/run'))).toBe(false);
  });

  it('retries the status after 3s while a restart is pending and refreshes on recovery', async () => {
    vi.useFakeTimers();
    try {
      let statusFails = false;
      apiFetchMock.mockImplementation(async (url: string) => {
        const u = String(url);
        if (u.endsWith('/migration/run')) {
          return { ok: true, warnings: [], logs: [], api_restart: true, after: MIGRATION_PAYLOAD };
        }
        if (u.endsWith('/migration/status')) {
          if (statusFails) throw new ApiError(503, 'restarting');
          return MIGRATION_PAYLOAD;
        }
        if (u.endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
        return STATUS_PAYLOAD;
      });
      apiFetchMock.mockClear();
      const wrapper = mountApp();
      await vi.advanceTimersByTimeAsync(0);
      await flushPromises();
      expect(migrationCalls()).toHaveLength(1);

      // Successful run arms the 3s restart check and opens the pending window.
      await wrapper.find('#panel-migration #migration-run-btn').trigger('click');
      await flushPromises();
      expect(migrationCalls()).toHaveLength(1);

      // API down during the pending window → keep last status + _restart_pending, retry.
      statusFails = true;
      await vi.advanceTimersByTimeAsync(3000);
      await flushPromises();
      expect(migrationCalls()).toHaveLength(2);
      expect(wrapper.find('#panel-migration .migration-ok').text()).toContain('Migration completed. API restart is in progress');

      // API back → successful fetch inside the pending window refreshes status and workers.
      statusFails = false;
      const statusCallsBefore = statusCalls().length;
      await vi.advanceTimersByTimeAsync(3000);
      await flushPromises();
      expect(migrationCalls()).toHaveLength(3);
      expect(statusCalls().length).toBeGreaterThan(statusCallsBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the failed migration popup and reloads the status when the run fails', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/migration/run')) {
        throw new ApiError(500, 'setup script failed');
      }
      if (String(url).endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
      if (String(url).endsWith('/migration/status')) return MIGRATION_PAYLOAD;
      return STATUS_PAYLOAD;
    });
    apiFetchMock.mockClear();

    await wrapper.find('#panel-migration #migration-run-btn').trigger('click');
    await flushPromises();

    const modal = document.getElementById('result-modal')!;
    expect(modal.textContent).toContain('Migration failed.');
    expect(modal.textContent).toContain('setup script failed');
    // Legacy catch reloads the status.
    expect(migrationCalls().length).toBeGreaterThan(0);
    expect((wrapper.find('#panel-migration #migration-run-btn').element as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('services_monitor pbdata status wiring (legacy pbdata status tab + prices overlay)', () => {
  const FETCH_SUMMARY = {
    timestamp: '2026-08-15 12:00:00',
    balances: { ws: ['alice'], rest: [] },
    positions: { ws: [], rest: [] },
    orders: { ws: [], rest: [] },
    prices: { binance: { active: true, symbols: 120 } },
    history: [],
    executions: [],
    last_fetch_ts: { alice: { balances: Math.floor(Date.now() / 1000) - 10 } },
  };

  async function selectPbdataStatusTab(wrapper: ReturnType<typeof mountApp>): Promise<void> {
    await wrapper.find('.sb-btn[data-panel="pbdata"]').trigger('click');
    await flushPromises();
    await wrapper.find('#panel-pbdata .tab-btn[data-tab="status"]').trigger('click');
    await flushPromises();
  }

  it('loads fetch summary and poller metrics when the status tab is selected', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await selectPbdataStatusTab(wrapper);

    const urls = apiFetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toContain('http://pbgui.test:8000/api/services/fetch-summary');
    expect(urls).toContain('http://pbgui.test:8000/api/services/poller-metrics');
  });

  it('does not load the status endpoints while other tabs are active', async () => {
    const wrapper = mountApp();
    await flushPromises();
    apiFetchMock.mockClear();

    await wrapper.find('.sb-btn[data-panel="pbdata"]').trigger('click');
    await flushPromises();
    await wrapper.find('#panel-pbdata .tab-btn[data-tab="settings"]').trigger('click');
    await flushPromises();

    const urls = apiFetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).not.toContain('http://pbgui.test:8000/api/services/fetch-summary');
    expect(urls).not.toContain('http://pbgui.test:8000/api/services/poller-metrics');
  });

  it('opens the prices overlay from the fetch-summary Prices group', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/fetch-summary')) return FETCH_SUMMARY;
      if (u.endsWith('/prices-snapshot')) {
        return { rows: [{ symbol: 'BTCUSDT', exchange: 'binance', price: 120000, ts: 100 }] };
      }
      if (u.endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
      if (u.endsWith('/migration/status')) return MIGRATION_PAYLOAD;
      return STATUS_PAYLOAD;
    });
    const wrapper = mountApp();
    await flushPromises();

    await selectPbdataStatusTab(wrapper);
    expect(wrapper.find('#prices-overlay').classes()).not.toContain('active');

    await wrapper.find('#panel-pbdata .fs-group-clickable').trigger('click');
    await flushPromises();

    expect(wrapper.find('#prices-overlay').classes()).toContain('active');
    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/prices-snapshot');
    expect(wrapper.find('#prices-overlay .po-table tbody tr').text()).toContain('BTCUSDT');
  });

  it('closes the prices overlay from the legacy close button', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.endsWith('/fetch-summary')) return FETCH_SUMMARY;
      if (u.endsWith('/prices-snapshot')) return { rows: [] };
      if (u.endsWith('/workers/status')) return { counts: { total: 4, running: 3 }, groups: [] };
      if (u.endsWith('/migration/status')) return MIGRATION_PAYLOAD;
      return STATUS_PAYLOAD;
    });
    const wrapper = mountApp();
    await flushPromises();
    await selectPbdataStatusTab(wrapper);
    await wrapper.find('#panel-pbdata .fs-group-clickable').trigger('click');
    await flushPromises();
    expect(wrapper.find('#prices-overlay').classes()).toContain('active');

    await wrapper.find('#prices-overlay .po-btn').trigger('click');
    expect(wrapper.find('#prices-overlay').classes()).not.toContain('active');
  });
});

describe('services_monitor help overlay wiring (legacy PBGUI_HELP_OPENER/_servicesGuideKeyword)', () => {
  type HelpGlobal = typeof globalThis & {
    PBGuiSharedHelp?: { open: ReturnType<typeof vi.fn> };
    PBGUI_HELP_OPENER?: () => void;
    _servicesGuideKeyword?: string;
  };

  afterEach(() => {
    delete (window as HelpGlobal).PBGuiSharedHelp;
    delete (window as HelpGlobal).PBGUI_HELP_OPENER;
    delete (window as HelpGlobal)._servicesGuideKeyword;
  });

  it('registers the opener with the overview keyword by default', async () => {
    const openMock = vi.fn();
    (window as HelpGlobal).PBGuiSharedHelp = { open: openMock };
    mountApp();
    await flushPromises();

    expect(typeof (window as HelpGlobal).PBGUI_HELP_OPENER).toBe('function');
    expect((window as HelpGlobal)._servicesGuideKeyword).toBe('services_overview');

    (window as HelpGlobal).PBGUI_HELP_OPENER!();
    expect(openMock).toHaveBeenCalledWith('services_overview', { token: 'tok' });
  });

  it('tracks the active service guide keyword for the opener', async () => {
    const openMock = vi.fn();
    (window as HelpGlobal).PBGuiSharedHelp = { open: openMock };
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('.sb-btn[data-panel="pbdata"]').trigger('click');
    await flushPromises();
    expect((window as HelpGlobal)._servicesGuideKeyword).toBe('pbdata');

    await wrapper.find('.sb-btn[data-panel="api-server"]').trigger('click');
    await flushPromises();
    expect((window as HelpGlobal)._servicesGuideKeyword).toBe('pbapiserver');

    await wrapper.find('.sb-btn[data-panel="overview"]').trigger('click');
    await flushPromises();
    expect((window as HelpGlobal)._servicesGuideKeyword).toBe('services_overview');

    (window as HelpGlobal).PBGUI_HELP_OPENER!();
    expect(openMock).toHaveBeenLastCalledWith('services_overview', { token: 'tok' });
  });

  it('no-ops the opener when the shared help overlay script is unavailable', async () => {
    mountApp();
    await flushPromises();

    expect(() => (window as HelpGlobal).PBGUI_HELP_OPENER!()).not.toThrow();
  });
});

describe('services_monitor sidebar resize handle (legacy sidebar resize IIFE)', () => {
  it('resizes the sidebar between the 150px/300px clamps', async () => {
    const wrapper = mountApp();
    const handle = wrapper.find('#sidebar-resize');
    expect(handle.exists()).toBe(true);
    const sidebar = wrapper.find('#sidebar').element as HTMLElement;

    await handle.trigger('mousedown', { clientX: 10 });
    expect(handle.classes()).toContain('active');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 190 }));
    expect(sidebar.style.width).toBe('180px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000 }));
    expect(sidebar.style.width).toBe('300px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -200 }));
    expect(sidebar.style.width).toBe('150px');

    document.dispatchEvent(new MouseEvent('mouseup'));
    await flushPromises();
    expect(handle.classes()).not.toContain('active');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
    expect(sidebar.style.width).toBe('150px');
  });
});
