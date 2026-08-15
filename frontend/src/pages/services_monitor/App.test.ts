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

function statusApi(): void {
  apiFetchMock.mockImplementation(async (url: string) =>
    String(url).endsWith('/workers/status')
      ? { counts: { total: 4, running: 3 }, groups: [] }
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
  it('renders the nav placeholder and the page-body layout container', () => {
    const wrapper = mountApp();

    expect(wrapper.find('#topnav').exists()).toBe(true);
    expect(wrapper.find('#page-body').exists()).toBe(true);
    expect(wrapper.find('#sidebar').exists()).toBe(true);
    expect(wrapper.find('#main-content').exists()).toBe(true);
  });

  it('renders one sidebar button and panel container per legacy panel', () => {
    const wrapper = mountApp();

    const buttons = wrapper.findAll('.sb-btn');
    expect(buttons).toHaveLength(PANEL_IDS.length);
    for (const id of PANEL_IDS) {
      expect(wrapper.find(`#panel-${id}`).exists(), `panel ${id} container`).toBe(true);
    }
    // The overview and workers panels are live since Tasks 9/10; the rest show
    // placeholders or panel components per task.
    expect(wrapper.find('#panel-overview .panel-placeholder').exists()).toBe(false);
    expect(wrapper.find('#panel-workers .workers-shell').exists()).toBe(true);
    expect(wrapper.find('#panel-migration .panel-placeholder-hint').text()).toContain('MigrationPanel');
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
    expect(tabs.map((b) => b.text())).toEqual(['📋 Log', '⚙ Settings', '📊 Status']);
    expect(wrapper.findAll('#panel-api-server .tab-btn').map((b) => b.text())).toEqual(['📋 Log', '⚙ Settings']);
    expect(wrapper.findAll('#panel-pbcoindata .tab-btn').map((b) => b.text())).toEqual(['📋 Log', 'Pool', '⚙ Settings']);
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

describe('services_monitor config', () => {
  it('derives the services API base from the boot origin', () => {
    expect(apiBase()).toBe('http://pbgui.test:8000/api/services');
  });

  it('derives the websocket base from the boot origin', () => {
    expect(wsBase()).toBe('ws://pbgui.test:8000');
  });
});
