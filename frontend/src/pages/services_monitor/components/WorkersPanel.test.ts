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

/** Mirror of the real backend payload (api/services.py) for the zh translation tests. */
const BACKEND_WORKERS: WorkersStatus = {
  counts: { total: 2, running: 1 },
  groups: [
    {
      id: 'queue',
      label: 'Queue Workers',
      items: [
        {
          id: 'market-data-task',
          label: 'Market Data Queue',
          type: 'process worker',
          running: true,
          summary: '3 pending, 2 active',
          description: 'Processes queued Market Data and Heatmap jobs from the shared task queue.',
          note: 'Stop sends SIGTERM to the worker process. If pending jobs remain, the PBAPIServer watchdog may start it again.',
          stats: [
            { label: 'PID', value: '4321' },
            { label: 'Pending', value: '3' },
            { label: 'Autostart', value: 'On' },
          ],
          monitor_path: '/api/jobs/main_page?embed=1',
        },
        {
          id: 'hlcvs-cleanup',
          label: 'HLCVS Cleanup',
          type: 'periodic task',
          running: false,
          summary: 'Maintains 2 cache target(s)',
          description: 'Periodically removes expired PB7 cache materialization data from configured cleanup targets.',
          stats: [
            { label: 'Running', value: 'No' },
            { label: 'Targets', value: '2' },
          ],
        },
      ],
    },
  ],
};

type DialogsGlobal = typeof globalThis & { PBGuiDialogs?: { confirm: ReturnType<typeof vi.fn> } };

function mountPanel(props: { workers?: WorkersStatus; loadError?: boolean; lang?: 'en' | 'zh' } = {}) {
  return mount(WorkersPanel, {
    props: { workers: props.workers ?? WORKERS, loadError: props.loadError ?? false },
    global: { plugins: [createI18n(props.lang ?? 'en')] },
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

describe('WorkersPanel worker metadata i18n (backend English text)', () => {
  it('translates known groups, workers, stats and values for the zh locale', () => {
    const wrapper = mountPanel({ workers: BACKEND_WORKERS, lang: 'zh' });

    expect(wrapper.find('.worker-group-title').text()).toBe('队列工作节点');
    const card = cardById(wrapper, 'market-data-task');
    expect(card.find('.card-name').text()).toBe('市场数据队列');
    expect(card.find('.worker-type').text()).toBe('进程工作节点');
    expect(card.find('.worker-summary').text()).toBe('3 待处理，2 活跃');
    // Card pills translate label and value.
    expect(card.findAll('.worker-pill').map((pill) => pill.text())).toEqual(['PID: 4321', '待处理: 3', '自动启动: 开']);
    // Detail pane translates title/subtitle/description/note.
    expect(wrapper.find('.worker-detail-title').text()).toBe('市场数据队列');
    expect(wrapper.find('.worker-detail-subtitle').text()).toBe('进程工作节点 • 3 待处理，2 活跃');
    expect(wrapper.find('.worker-detail-desc').text()).toBe('处理共享任务队列中的市场数据与热力图任务。');
    expect(wrapper.find('.worker-detail-note').text()).toContain('停止会向工作节点进程发送 SIGTERM');
    expect(wrapper.findAll('.worker-stat-label').map((el) => el.text())).toEqual(['PID', '待处理', '自动启动']);
    expect(wrapper.findAll('.worker-stat-value').map((el) => el.text())).toEqual(['4321', '3', '开']);
  });

  it('translates pattern summaries and the monitor title for the zh locale', async () => {
    const wrapper = mountPanel({ workers: BACKEND_WORKERS, lang: 'zh' });

    // market-data-task is selected by default and embeds its monitor page.
    expect(wrapper.find('.worker-monitor-frame').attributes('title')).toBe('市场数据队列 监控');

    await cardById(wrapper, 'hlcvs-cleanup').trigger('click');

    expect(wrapper.find('.worker-detail-title').text()).toBe('HLCVS 缓存清理');
    expect(wrapper.find('.worker-detail-subtitle').text()).toBe('周期任务 • 维护 2 个缓存清理目标');
  });

  it('renders the backend English verbatim for the en locale', () => {
    const wrapper = mountPanel({ workers: BACKEND_WORKERS });

    expect(wrapper.find('.worker-group-title').text()).toBe('Queue Workers');
    expect(wrapper.find('.worker-detail-title').text()).toBe('Market Data Queue');
    expect(wrapper.find('.worker-detail-subtitle').text()).toBe('process worker • 3 pending, 2 active');
    expect(wrapper.find('.worker-detail-desc').text()).toBe(
      'Processes queued Market Data and Heatmap jobs from the shared task queue.'
    );
  });

  it('falls back to the backend text for unknown workers in the zh locale', () => {
    const wrapper = mountPanel({ lang: 'zh' });

    expect(wrapper.find('.worker-group-title').text()).toBe('Web');
    expect(cardById(wrapper, 'w1').find('.card-name').text()).toBe('Frontend');
    expect(cardById(wrapper, 'w1').find('.worker-type').text()).toBe('uvicorn');
    expect(wrapper.find('.worker-detail-subtitle').text()).toBe('uvicorn • serving on :8080');
    expect(wrapper.findAll('.worker-stat-label').map((el) => el.text())).toEqual(['CPU', 'MEM', 'UP', 'HIDDEN']);
  });
});
