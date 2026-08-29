import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyData, type CopyDataApi } from './useCopyData';

/* M-data-7 — the copy-data store: the SSH form, dry-run flow and schedule
   editor (legacy market_data_main.html :5023-5254, :7742-7811):
     collect/validate          :5038-5060
     schedules CRUD            :5127-5254
     queue dry-run/copy        :7742-7779
     test connection           :7781-7811
     job monitor mounting      :4215-4232 */


let fetchJson: ReturnType<typeof vi.fn>;
let fetchJobsJson: ReturnType<typeof vi.fn>;
let rawFetch: ReturnType<typeof vi.fn>;
let showToast: ReturnType<typeof vi.fn>;
let isPanelActive: ReturnType<typeof vi.fn>;

const t = (key: string, params?: Record<string, unknown>): string =>
  Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), key);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

function makeStore(overrides: { serial?: () => string; timers?: boolean } = {}) {
  return useCopyData({
    api: { fetchJson, fetchJobsJson } as unknown as CopyDataApi,
    fetchImpl: rawFetch as unknown as typeof fetch,
    marketDataUrl: (path: string) => `http://h:8/api/market-data${path}`,
    t,
    showToast,
    isPanelActive,
    serial: overrides.serial ?? (() => 'S7'),
  });
}

beforeEach(() => {
  fetchJson = vi.fn();
  fetchJobsJson = vi.fn();
  rawFetch = vi.fn(async () => json({}));
  showToast = vi.fn();
  isPanelActive = vi.fn(() => false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('form state (:3425-3455 defaults)', () => {
  it('defaults ssh to ssh and the three checked exchanges', () => {
    const store = makeStore();
    expect(store.sshCommand.value).toBe('ssh');
    expect(store.target.value).toBe('');
    expect(store.destinationRoot.value).toBe('');
    expect(store.isExchangeSelected('binance')).toBe(true);
    expect(store.isExchangeSelected('bybit')).toBe(true);
    expect(store.isExchangeSelected('bitget')).toBe(true);
    expect(store.isExchangeSelected('okx')).toBe(false);
    expect(store.isExchangeSelected('hyperliquid')).toBe(false);
  });

  it('toggles exchanges immutably', () => {
    const store = makeStore();
    store.setExchangeSelected('okx', true);
    expect(store.isExchangeSelected('okx')).toBe(true);
    store.setExchangeSelected('okx', false);
    expect(store.isExchangeSelected('okx')).toBe(false);
  });
});

describe('testCopyDataConnection (:7781-7811)', () => {
  it('validates without requiring exchanges and posts the request', async () => {
    const store = makeStore();
    store.setTarget('user@host');
    store.setExchangeSelected('binance', false);
    store.setExchangeSelected('bybit', false);
    store.setExchangeSelected('bitget', false); // no exchange selected — still allowed
    fetchJson.mockResolvedValue({ success: true, message: 'SSH OK' });
    await store.testConnection();
    expect(fetchJson).toHaveBeenCalledWith(
      '/copy-data/test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          target: 'user@host',
          ssh_command: 'ssh',
          destination_root: '',
          exchanges: [],
        }),
      })
    );
    expect(store.feedback.value).toEqual({ message: 'SSH OK', level: 'info' });
    expect(showToast).toHaveBeenCalledWith('SSH OK', 'success');
  });

  it('blocks a missing target (:7785-7789)', async () => {
    const store = makeStore();
    await store.testConnection();
    expect(fetchJson).not.toHaveBeenCalled();
    expect(store.feedback.value).toEqual({ message: 'market.remoteTargetRequired', level: 'error' });
    expect(showToast).toHaveBeenCalledWith('market.remoteTargetRequired', 'error');
  });

  it('surfaces failures with detail/error/message preference (:7799)', async () => {
    const store = makeStore();
    store.setTarget('host');
    fetchJson.mockResolvedValue({ success: false, error: 'unreachable' });
    await store.testConnection();
    expect(store.feedback.value).toEqual({ message: 'unreachable', level: 'error' });
  });
});

describe('queueCopyDataJob (:7742-7779)', () => {
  it('queues a dry run, mounts the monitor and starts the summary poll', async () => {
    const store = makeStore();
    store.setTarget('host');
    store.setExchangeSelected('bybit', true);
    store.setExchangeSelected('bybit', false);
    fetchJson.mockResolvedValue({ success: true, job_id: 'job-dry' });
    fetchJobsJson.mockResolvedValue({ status: 'running' });
    await store.queueJob(true);
    expect(fetchJson).toHaveBeenCalledWith('/copy-data/dry-run/queue', {
      method: 'POST',
      body: JSON.stringify({
        target: 'host',
        ssh_command: 'ssh',
        destination_root: '',
        exchanges: ['binance', 'bitget'],
      }),
    });
    expect(store.jobMonitorSrc.value).toContain('_ts='); // force remount (:7769)
    expect(store.jobMonitorSrc.value).toContain('exchange=ohlcv');
    expect(store.dryRunSummary.value).toMatchObject({ status: 'running' });
    expect(store.isQueueDisabled.value).toBe(false);
  });

  it('queues a real copy job without the summary poll', async () => {
    const store = makeStore();
    store.setTarget('host');
    fetchJson.mockResolvedValue({ success: true, job_id: 'job-live', message: 'Queued copy.' });
    await store.queueJob(false);
    expect(fetchJson).toHaveBeenCalledWith('/copy-data/queue', expect.anything());
    expect(store.dryRunSummary.value).toBeNull();
    expect(store.feedback.value).toEqual({ message: 'Queued copy.', level: 'info' });
  });

  it('validates the target and exchange selection (:7747-7751)', async () => {
    const store = makeStore();
    store.setTarget('host');
    store.setExchangeSelected('binance', false);
    store.setExchangeSelected('bybit', false);
    store.setExchangeSelected('bitget', false);
    await store.queueJob(false);
    expect(store.feedback.value).toEqual({ message: 'market.selectExchangeToCopy', level: 'error' });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('reports server failures (:7763-7764)', async () => {
    const store = makeStore();
    store.setTarget('host');
    fetchJson.mockResolvedValue({ success: false, error: 'busy' });
    await store.queueJob(false);
    expect(store.feedback.value).toEqual({ message: 'busy', level: 'error' });
    expect(showToast).toHaveBeenCalledWith('busy', 'error');
  });
});

describe('dry-run summary lifecycle (:5256-5267)', () => {
  it('reset clears the summary and stops the poll', async () => {
    const store = makeStore();
    store.setTarget('host');
    fetchJson.mockResolvedValue({ success: true, job_id: 'job-dry' });
    fetchJobsJson.mockResolvedValue({ status: 'done' });
    rawFetch.mockResolvedValue(json({ log: [] }));
    await store.queueJob(true);
    await vi.waitFor(() => expect(store.dryRunSummary.value).toMatchObject({ status: 'done' }));
    store.resetDryRunSummary();
    expect(store.dryRunSummary.value).toBeNull();
  });
});

describe('schedules (:5062-5254)', () => {
  it('loads schedules through the panel-enter hook and stops when leaving', async () => {
    const store = makeStore();
    rawFetch.mockImplementation(async () => json({ schedules: [{ id: 's1', name: 'Nightly' }] }));
    isPanelActive.mockReturnValue(true);
    await store.loadSchedules(true);
    expect(rawFetch).toHaveBeenCalledWith(
      'http://h:8/api/market-data/copy-data/schedules',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(store.schedules.value).toEqual([{ id: 's1', name: 'Nightly' }]);
    isPanelActive.mockReturnValue(false);
    store.stopSchedulePoll();
  });

  it('extracts detail from error responses (:5083-5085)', async () => {
    const store = makeStore();
    rawFetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'boom' }), { status: 500 }));
    await store.loadSchedules(true);
    expect(store.feedback.value).toEqual({ message: 'boom', level: 'error' });
  });

  it('saves a new schedule with the editor fields (:5184-5223)', async () => {
    const store = makeStore();
    store.setTarget('host');
    store.setScheduleName('Optimizer');
    store.setScheduleInterval('12');
    rawFetch.mockResolvedValue(json({ success: true, schedule: { name: 'Optimizer' } }));
    await store.saveSchedule();
    expect(rawFetch).toHaveBeenCalledWith(
      'http://h:8/api/market-data/copy-data/schedules',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          target: 'host',
          ssh_command: 'ssh',
          destination_root: '',
          exchanges: ['binance', 'bybit', 'bitget'],
          id: '',
          expected_updated_at: '',
          name: 'Optimizer',
          interval_hours: 12,
          enabled: true,
        }),
      })
    );
    expect(store.isEditing.value).toBe(false); // editor reset (:5214)
  });

  it('blocks invalid intervals (:5189-5191)', async () => {
    const store = makeStore();
    store.setTarget('host');
    store.setScheduleInterval('0');
    await store.saveSchedule();
    expect(store.feedback.value).toEqual({ message: 'market.scheduleIntervalError', level: 'error' });
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it('edits an existing schedule: copies the form and posts the update guard (:5165-5182)', async () => {
    const store = makeStore();
    store.schedules.value = [
      {
        id: 's1',
        name: 'Nightly',
        enabled: false,
        interval_hours: 6,
        exchanges: ['okx'],
        target: 'user@host',
        ssh_command: 'ssh -p 2222',
        destination_root: '/srv/remote',
        updated_at: '2026-08-15T00:00:00Z',
      },
    ];
    store.editSchedule('s1');
    expect(store.target.value).toBe('user@host');
    expect(store.sshCommand.value).toBe('ssh -p 2222');
    expect(store.destinationRoot.value).toBe('/srv/remote');
    expect(store.isExchangeSelected('okx')).toBe(true);
    expect(store.isExchangeSelected('binance')).toBe(false);
    expect(store.scheduleName.value).toBe('Nightly');
    expect(store.scheduleInterval.value).toBe('6');
    expect(store.scheduleEnabled.value).toBe(false);
    expect(store.isEditing.value).toBe(true);
    rawFetch.mockResolvedValue(json({ success: true, schedule: { name: 'Nightly' } }));
    await store.saveSchedule();
    const post = rawFetch.mock.calls
      .filter((call) => (call[1] as RequestInit | undefined)?.method === 'POST')
      .at(-1)!;
    const body = JSON.parse(String((post[1] as RequestInit).body));
    expect(body.id).toBe('s1');
    expect(body.expected_updated_at).toBe('2026-08-15T00:00:00Z');
    expect(body.interval_hours).toBe(6);
    expect(body.enabled).toBe(false);
  });

  it('cancel-edit resets the editor but keeps the form (:5155-5163)', () => {
    const store = makeStore();
    store.setTarget('keep-me');
    store.setScheduleName('x');
    store.setScheduleInterval('3');
    store.setScheduleEnabled(false);
    store.editingId.value = 's1';
    store.resetEditor();
    expect(store.scheduleName.value).toBe('');
    expect(store.scheduleInterval.value).toBe('24');
    expect(store.scheduleEnabled.value).toBe(true);
    expect(store.isEditing.value).toBe(false);
    expect(store.target.value).toBe('keep-me');
  });

  it('runs a schedule and remounts the monitor (:5225-5241)', async () => {
    const store = makeStore();
    rawFetch.mockResolvedValue(json({ success: true, message: 'Queued.' }));
    await store.runSchedule('s9');
    expect(rawFetch).toHaveBeenCalledWith(
      'http://h:8/api/market-data/copy-data/schedules/s9/run',
      expect.objectContaining({ method: 'POST' })
    );
    expect(store.jobMonitorSrc.value).toContain('_ts=');
    expect(store.feedback.value).toEqual({ message: 'Queued.', level: 'info' });
  });

  it('deletes a schedule, resetting the editor when it was being edited (:5243-5254)', async () => {
    const store = makeStore();
    store.editingId.value = 's2';
    rawFetch.mockResolvedValue(json({ success: true }));
    await store.deleteSchedule('s2');
    expect(rawFetch).toHaveBeenCalledWith(
      'http://h:8/api/market-data/copy-data/schedules/s2',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(store.isEditing.value).toBe(false);
    expect(showToast).toHaveBeenCalledWith('market.copyScheduleDeleted', 'success');
  });

  it('reports run failures (:5236-5240)', async () => {
    const store = makeStore();
    rawFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'locked' }), { status: 409 }));
    await store.runSchedule('s9');
    expect(store.feedback.value).toEqual({ message: 'locked', level: 'error' });
  });
});

describe('job monitor (:4215-4232)', () => {
  it('builds the ohlcv copy monitor URL and only switches on change/force', () => {
    const store = makeStore();
    store.mountJobMonitor(false);
    expect(store.jobMonitorSrc.value).toBe(
      '/api/jobs/main_page?v=S7&embed=1&exchange=ohlcv&job_type=ohlcv_copy%2Cohlcv_copy_dry_run'
    );
    const first = store.jobMonitorSrc.value;
    store.mountJobMonitor(false);
    expect(store.jobMonitorSrc.value).toBe(first);
    store.mountJobMonitor(true);
    expect(store.jobMonitorSrc.value).not.toBe(first);
  });
});

describe('feedback box (:5023-5036)', () => {
  it('clears on an empty message and warns on error/warning levels', () => {
    const store = makeStore();
    store.setFeedback('boom', 'error');
    expect(store.feedback.value).toEqual({ message: 'boom', level: 'error' });
    store.setFeedback('', 'info');
    expect(store.feedback.value).toBeNull();
  });
});
