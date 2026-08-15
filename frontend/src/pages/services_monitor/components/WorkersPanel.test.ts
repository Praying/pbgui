import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { apiFetch } from '@/shared/api';
import WorkersPanel from './WorkersPanel.vue';
import type { WorkersStatus } from '../types';

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

vi.mock('@/shared/api', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(),
}));

vi.mock('./LogViewer.vue', () => ({
  // stub: keeps WS interaction inside LogViewer's own tests
  default: { name: 'LogViewer', props: ['file'], template: '<div class="logviewer-stub">{{ file }}</div>' },
}));

const apiFetchMock = vi.mocked(apiFetch);

const WORKERS: WorkersStatus = {
  counts: { total: 3, running: 2 },
  groups: [
    {
      id: 'web',
      label: 'Web',
      items: [
        {
          id: 'w1',
          label: 'Frontend',
          type: 'uvicorn',
          running: true,
          summary: 'serving on :8080',
          description: 'Serves the web UI.',
          stats: [
            { label: 'CPU', value: '5%' },
            { label: 'MEM', value: '10%' },
            { label: 'UP', value: '1d' },
            { label: 'HIDDEN', value: '4th stat not shown on cards' },
          ],
          log_file: 'logs/frontend.log',
        },
        {
          id: 'w2',
          label: 'Worker Two',
          type: 'celery',
          running: false,
          summary: 'idle',
          monitor_path: '/vps/monitor/w2',
        },
        { id: 'w3', running: false, available: false, summary: 'not installed' },
      ],
    },
  ],
};

type DialogsGlobal = typeof globalThis & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } };

function mountPanel(props: { workers?: WorkersStatus; loadError?: boolean } = {}) {
  return mount(WorkersPanel, {
    props: { workers: props.workers ?? WORKERS, loadError: props.loadError ?? false },
    global: { plugins: [createI18n('en')] },
  });
}

function cardById(wrapper: ReturnType<typeof mountPanel>, id: string) {
  const card = wrapper.findAll('.worker-card').find((c) => c.attributes('data-worker') === id);
  expect(card, `worker card ${id}`).toBeDefined();
  return card!;
}

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({}); // default; individual tests override
  (window as DialogsGlobal).PBGuiDialogs = { confirm: vi.fn(async () => true) };
});

afterEach(() => {
  delete (window as DialogsGlobal).PBGuiDialogs;
  document.getElementById('result-modal')?.remove();
});

describe('WorkersPanel rendering (legacy renderWorkers)', () => {
  it('renders the group header and worker cards from the payload', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('.worker-group-title').text()).toBe('Web');
    expect(wrapper.find('.worker-group-subtitle').text()).toBe('3 item(s)');
    expect(wrapper.findAll('.worker-card')).toHaveLength(3);
    expect(cardById(wrapper, 'w1').classes()).toContain('running');
    expect(cardById(wrapper, 'w2').classes()).toContain('stopped');
    expect(cardById(wrapper, 'w1').find('.card-name').text()).toBe('Frontend');
    expect(cardById(wrapper, 'w1').find('.worker-type').text()).toBe('uvicorn');
    // Cards show at most 3 stat pills (legacy slice(0, 3)).
    expect(cardById(wrapper, 'w1').findAll('.worker-pill')).toHaveLength(3);
  });

  it('defaults the selection to the first worker and renders its detail', () => {
    const wrapper = mountPanel();

    expect(cardById(wrapper, 'w1').classes()).toContain('selected');
    expect(wrapper.find('.worker-detail-title').text()).toBe('Frontend');
    expect(wrapper.find('.worker-detail-subtitle').text()).toBe('uvicorn • serving on :8080');
    expect(wrapper.find('.worker-state-badge').text()).toBe('Running');
    expect(wrapper.find('.worker-detail-desc').text()).toBe('Serves the web UI.');
    // Detail stats grid shows every stat, unlike the card row.
    expect(wrapper.findAll('.worker-stat-card')).toHaveLength(4);
  });

  it('switches the selection on card click', async () => {
    const wrapper = mountPanel();

    await cardById(wrapper, 'w2').trigger('click');

    expect(cardById(wrapper, 'w2').classes()).toContain('selected');
    expect(wrapper.find('.worker-detail-title').text()).toBe('Worker Two');
  });

  it('shows the empty state when no groups are available', () => {
    const wrapper = mountPanel({ workers: { counts: { total: 0, running: 0 }, groups: [] } });

    expect(wrapper.find('.workers-groups').text()).toContain('No workers available.');
    expect(wrapper.find('.worker-detail-body .worker-detail-empty').text()).toContain(
      'Select a worker to inspect status, actions, and logs.'
    );
  });

  it('shows the summary from worker counts in the ctrl strip', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('.ctrl-strip .status-dot').classes()).toContain('running');
    expect(wrapper.find('.ctrl-strip .status-label').text()).toBe('2 / 3 running');
  });

  it('shows the legacy failure text when a forced refresh failed', () => {
    const wrapper = mountPanel({ loadError: true });

    expect(wrapper.find('.workers-groups').text()).toContain('Failed to load worker status.');
  });
});

describe('WorkersPanel actions (legacy workerConfirmAction/workerRestart/workerAction)', () => {
  it('confirms and POSTs stop for a running worker, then requests a refresh', async () => {
    const wrapper = mountPanel();

    await cardById(wrapper, 'w1').find('.card-btn.stop').trigger('click');
    await flushPromises();

    expect((window as DialogsGlobal).PBGuiDialogs!.confirm).toHaveBeenCalledWith({
      title: 'Stop worker',
      message: 'Stop worker "Frontend"?',
      confirmText: 'Stop',
    });
    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/workers/w1/stop', {
      method: 'POST',
    });
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('does not POST stop when the confirm dialog is rejected', async () => {
    (window as DialogsGlobal).PBGuiDialogs!.confirm.mockResolvedValue(false);
    const wrapper = mountPanel();

    await cardById(wrapper, 'w1').find('.card-btn.stop').trigger('click');

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(wrapper.emitted('refresh')).toBeUndefined();
  });

  it('confirms and POSTs restart with the legacy restart message', async () => {
    const wrapper = mountPanel();

    await wrapper.find('.worker-detail .ctrl-btn.restart').trigger('click');
    await flushPromises();

    expect((window as DialogsGlobal).PBGuiDialogs!.confirm).toHaveBeenCalledWith({
      title: 'Restart worker',
      message: 'Restart worker "Frontend"?',
      confirmText: 'Restart',
    });
    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/workers/w1/restart', {
      method: 'POST',
    });
  });

  it('starts a stopped worker without a confirmation dialog', async () => {
    const wrapper = mountPanel();

    await cardById(wrapper, 'w2').find('.card-btn.start').trigger('click');
    await flushPromises();

    expect((window as DialogsGlobal).PBGuiDialogs!.confirm).not.toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledWith('http://pbgui.test:8000/api/services/workers/w2/start', {
      method: 'POST',
    });
  });

  it('falls back to the result popup when PBGuiDialogs is unavailable', async () => {
    delete (window as DialogsGlobal).PBGuiDialogs;
    const wrapper = mountPanel();

    await cardById(wrapper, 'w1').find('.card-btn.stop').trigger('click');
    await flushPromises();

    const modal = document.getElementById('result-modal');
    expect(modal).not.toBeNull();
    expect(modal!.textContent).toContain('Confirmation blocked');
    expect(modal!.textContent).toContain('Confirmation dialog is unavailable.');
    expect(modal!.textContent).toContain('Reload the page and try again.');
    // The popup fallback POSTs to /api/notify_log - no worker action may fire.
    expect(apiFetchMock.mock.calls.some(([url]) => String(url).includes('/workers/'))).toBe(false);
  });

  it('still requests a refresh when the action request fails (legacy swallow)', async () => {
    apiFetchMock.mockRejectedValue(new Error('boom'));
    const wrapper = mountPanel();

    await cardById(wrapper, 'w2').find('.card-btn.start').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });

  it('emits refresh from the ctrl strip refresh button', async () => {
    const wrapper = mountPanel();

    await wrapper.find('.ctrl-strip .ctrl-btn.refresh').trigger('click');

    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });
});

describe('WorkersPanel log section (legacy updateWorkerLog)', () => {
  it('streams the dedicated log file of the selected worker', () => {
    const wrapper = mountPanel();

    const stub = wrapper.find('.logviewer-stub');
    expect(stub.exists()).toBe(true);
    expect(stub.text()).toBe('logs/frontend.log');
  });

  it('embeds the monitor page for workers with monitor_path but no log_file', async () => {
    const wrapper = mountPanel();

    await cardById(wrapper, 'w2').trigger('click');

    const frame = wrapper.find('.worker-monitor-frame');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('src')).toBe('/vps/monitor/w2');
    expect(frame.attributes('title')).toBe('Worker Two monitor');
    expect(wrapper.find('.logviewer-stub').exists()).toBe(false);
  });

  it('shows the no-dedicated-log hint for workers without log_file or monitor_path', async () => {
    const wrapper = mountPanel();

    await cardById(wrapper, 'w3').trigger('click');

    expect(wrapper.find('.worker-log-empty').text()).toContain(
      'No dedicated local log is configured for this worker.'
    );
  });
});
