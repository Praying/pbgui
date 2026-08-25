import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import CopyDataPanel from './CopyDataPanel.vue';
import {
  useCopyData,
  type CopyDataApi,
  type UseCopyData,
} from '../../composables/useCopyData';

/* M-data-7 — the copy-data panel mount (market_data_main.html:3412-3500)
   over a real useCopyData store: form defaults, the exchange grid, the
   action row, the dry-run summary card and the schedule list/editor. */

const t = (key: string, params?: Record<string, unknown>): string => key;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

let fetchJson: ReturnType<typeof vi.fn>;
let fetchJobsJson: ReturnType<typeof vi.fn>;
let rawFetch: ReturnType<typeof vi.fn>;
let showToast: ReturnType<typeof vi.fn>;

function makeStore(): UseCopyData {
  return useCopyData({
    api: { fetchJson, fetchJobsJson } as unknown as CopyDataApi,
    fetchImpl: rawFetch as unknown as typeof fetch,
    marketDataUrl: (path: string) => `http://h:8/api/market-data${path}`,
    t,
    showToast,
    isPanelActive: () => true,
    serial: () => 'S1',
  });
}

function mountPanel(store: UseCopyData) {
  return mount(CopyDataPanel, {
    props: { store },
    global: { plugins: [createI18n('en')] },
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  fetchJson = vi.fn();
  fetchJobsJson = vi.fn();
  rawFetch = vi.fn(async () => json({}));
  showToast = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the panel shell (:3413-3424)', () => {
  it('renders the header, warning callout and empty schedules note', () => {
    const panel = mountPanel(makeStore());
    expect(panel.find('.copy-data-shell').exists()).toBe(true);
    expect(panel.find('.eyebrow').text()).toBe('OHLCV Copy');
    expect(panel.find('h2').text()).toBe('Copy Data');
    expect(panel.findAll('.callout.warning')).toHaveLength(1); // static warning
    expect(panel.find('#copy-data-schedule-list .note').text()).toBe('No Copy Data schedules configured.');
  });
});

describe('the SSH form (:3425-3456)', () => {
  it('binds the three fields and the exchange checkboxes with defaults', async () => {
    const store = makeStore();
    const panel = mountPanel(store);
    expect((panel.find('#copy-data-ssh-command').element as HTMLInputElement).value).toBe('ssh');
    const checks = panel.findAll('[data-copy-data-exchange]');
    expect(checks.map((c) => c.attributes('data-copy-data-exchange'))).toEqual([
      'binance',
      'bybit',
      'bitget',
      'okx',
      'hyperliquid',
    ]);
    const checked = checks.filter((c) => c.attributes('aria-checked') === 'true');
    expect(checked.map((c) => c.attributes('data-copy-data-exchange'))).toEqual([
      'binance',
      'bybit',
      'bitget',
    ]);
    await panel.find('#copy-data-target').setValue('user@host');
    await panel.find('#copy-data-destination-root').setValue('/srv/ohlcv');
    expect(store.target.value).toBe('user@host');
    expect(store.destinationRoot.value).toBe('/srv/ohlcv');
  });

  it('runs the connection test from the action row (:7781-7811)', async () => {
    const store = makeStore();
    const panel = mountPanel(store);
    await panel.find('#copy-data-target').setValue('user@host');
    fetchJson.mockResolvedValue({ success: true, message: 'SSH OK' });
    await panel.find('#btn-copy-data-test').trigger('click');
    await flush();
    expect(panel.find('#copy-data-feedback').text()).toBe('SSH OK');
  });

  it('queues a dry run and renders the summary card (:7742-7779, :5431-5475)', async () => {
    const store = makeStore();
    const panel = mountPanel(store);
    await panel.find('#copy-data-target').setValue('user@host');
    fetchJson.mockResolvedValue({ success: true, job_id: 'job-dry' });
    fetchJobsJson.mockResolvedValue({
      status: 'done',
      progress: {
        last_result: {
          dry_run: true,
          remote_paths: ['/srv/binanceusdm'],
          files_transferred: 12,
          transfer_size_bytes: 2048,
          exchange_stats: [],
        },
      },
    });
    await panel.find('#btn-copy-data-dry-run').trigger('click');
    await flush(); // queueJob resolves, the poll fetches the job
    await flush(); // the done-path fetches the log before the final render
    expect(panel.find('#copy-data-dry-run-summary').exists()).toBe(true);
    expect(panel.find('.copy-data-summary-title').text()).toBe('Dry-run summary');
    const labels = panel.findAll('.copy-data-summary-label').map((l) => l.text());
    expect(labels).toEqual([
      'Status',
      'Remote root',
      'Exchanges',
      'Files to transfer',
      'Transfer size',
      'Total source size',
      'Sent / received',
      'Duration',
    ]);
    const values = panel.findAll('.copy-data-summary-value').map((v) => v.text());
    expect(values[0]).toBe('done');
    expect(values[3]).toBe('12');
    expect(values[4]).toBe('2.00 KB');
    expect(panel.find('.copy-data-summary-log').text()).toContain('/srv/binanceusdm');
  });
});

describe('the schedules section (:3458-3488)', () => {
  const SCHEDULES = {
    schedules: [
      {
        id: 's1',
        name: 'Nightly',
        enabled: true,
        interval_hours: 24,
        exchanges: ['binance', 'bybit'],
        target: 'user@host',
        destination_root: '/srv/ohlcv',
        next_run: '2026-08-16T02:00:00Z',
        updated_at: 'u',
      },
      {
        id: 's2',
        name: 'Paused',
        enabled: false,
        interval_hours: 6,
        exchanges: [],
        target: 't',
        destination_root: '',
        last_error: 'ssh refused',
      },
    ],
  };

  async function loadedPanel() {
    rawFetch.mockImplementation(async () => json(SCHEDULES));
    const store = makeStore();
    await store.loadSchedules(true);
    const panel = mountPanel(store);
    await flush();
    return { store, panel };
  }

  it('renders the schedule rows with timing, target and error detail', async () => {
    const { panel } = await loadedPanel();
    const rows = panel.findAll('.copy-data-schedule-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.find('.copy-data-schedule-name').text()).toBe('Nightly');
    expect(rows[0]!.text()).toContain('user@host:/srv/ohlcv');
    expect(rows[0]!.text()).toContain('binance, bybit');
    expect(rows[0]!.classes()).not.toContain('is-disabled');
    expect(rows[1]!.classes()).toContain('is-disabled');
    expect(rows[1]!.text()).toContain('ssh refused');
  });

  it('wires the run/edit/delete row actions (:9283-9293)', async () => {
    const { panel } = await loadedPanel();
    // run/delete reload the list — keep serving the schedule rows
    rawFetch.mockImplementation(
      async () => json({ success: true, message: 'Queued.', ...SCHEDULES })
    );
    await panel.find('[data-copy-schedule-action="run"]').trigger('click');
    await flush();
    expect(rawFetch).toHaveBeenCalledWith(
      'http://h:8/api/market-data/copy-data/schedules/s1/run',
      expect.objectContaining({ method: 'POST' })
    );
    await panel.find('[data-copy-schedule-action="edit"][data-schedule-id="s2"]').trigger('click');
    await flush();
    expect((panel.find('#copy-data-schedule-name').element as HTMLInputElement).value).toBe('Paused');
    expect(panel.find('#btn-copy-data-schedule-cancel').exists()).toBe(true);
    expect(panel.find('#btn-copy-data-schedule-save').text()).toBe('Update schedule');
    await panel.find('[data-copy-schedule-action="delete"]').trigger('click');
    await flush();
    expect(rawFetch).toHaveBeenCalledWith(
      'http://h:8/api/market-data/copy-data/schedules/s1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('saves a new schedule from the editor fields (:5184-5223)', async () => {
    const store = makeStore();
    const panel = mountPanel(store);
    await panel.find('#copy-data-target').setValue('user@host');
    await panel.find('#copy-data-schedule-name').setValue('Optimizer');
    await panel.find('#copy-data-schedule-interval').setValue('12');
    await panel.find('#copy-data-schedule-enabled').trigger('click');
    rawFetch.mockResolvedValue(json({ success: true, schedule: { name: 'Optimizer' } }));
    await panel.find('#btn-copy-data-schedule-save').trigger('click');
    await flush();
    const post = rawFetch.mock.calls
      .filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST')
      .at(-1)!;
    const body = JSON.parse(String((post[1] as RequestInit).body));
    expect(body).toMatchObject({
      name: 'Optimizer',
      interval_hours: 12,
      enabled: false,
      target: 'user@host',
      ssh_command: 'ssh',
      exchanges: ['binance', 'bybit', 'bitget'],
    });
    expect(panel.find('#btn-copy-data-schedule-cancel').exists()).toBe(false); // reset (:5214)
  });
});

describe('the job monitor (:3489-3498, :4215-4232)', () => {
  it('renders the copy monitor iframe once mounted', () => {
    const store = makeStore();
    store.mountJobMonitor(false);
    const panel = mountPanel(store);
    const frame = panel.find('#copy-data-job-monitor-frame');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes('src')).toBe(
      '/app/jobs_monitor.html?v=S1&embed=1&exchange=ohlcv&job_type=ohlcv_copy%2Cohlcv_copy_dry_run'
    );
  });
});
