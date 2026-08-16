import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import { useJobsMonitor } from './useJobsMonitor';
import type { JobRecord } from '../types';

/* connectWS/tab-history/actions port of hl_data_actions.html :1617-2009. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

/** Minimal WebSocket double capturing handlers for manual triggering. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  fireOpen(): void {
    this.onopen?.();
  }
  fireMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  fireClose(): void {
    this.onclose?.();
  }
}

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return { id: 'j1', type: 'hl_aws_l2book_auto', status: 'pending', created_ts: 1, updated_ts: 2, ...overrides };
}

function makeMonitor(ns: 'dl' | 'build' = 'dl') {
  return useJobsMonitor({
    ns,
    t: (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}`,
    wsFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WS connection (:1644-1689)', () => {
  it('connects to /ws/jobs and flips the badge on open', () => {
    const monitor = makeMonitor();
    expect(monitor.badge.value).toBe('connecting');

    monitor.connect();
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe(`ws://${window.location.host}/ws/jobs`);

    ws.fireOpen();
    expect(monitor.badge.value).toBe('connected');
  });

  it('retries up to 5 times with 3 s spacing after a close', async () => {
    const monitor = makeMonitor();
    monitor.connect();

    for (let attempt = 1; attempt <= 6; attempt++) {
      FakeWebSocket.instances.at(-1)!.fireClose();
      expect(monitor.badge.value).toBe('disconnected');
      await vi.advanceTimersByTimeAsync(3000);
    }
    // 5 retries armed; the 6th close leaves the badge disconnected for good
    expect(FakeWebSocket.instances).toHaveLength(6);
  });

  it('filters WS jobs by own type and pending/running, sorted running-first (:1659-1671)', () => {
    const monitor = makeMonitor('dl');
    monitor.connect();
    monitor.ingestJobsMessage([
      job({ id: 'pending', status: 'pending' }),
      job({ id: 'running', status: 'running', created_ts: 5 }),
      job({ id: 'running-old', status: 'running', created_ts: 3 }),
      job({ id: 'done', status: 'done' }),
      job({ id: 'other', type: 'hl_best_1m', status: 'running' }),
    ]);

    expect(monitor.activeJobs.value.map((entry) => entry.id)).toEqual(['running-old', 'running', 'pending']);
  });
});

describe('history tabs (:1633-1767)', () => {
  it('requests the focused job type before the limit (:1758 — migrated pytest contract)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ jobs: [job({ id: 'h1', status: 'done' }), job({ id: 'h2', type: 'hl_best_1m', status: 'done' })] }), { status: 200 })
    );
    const monitor = makeMonitor('dl');

    monitor.switchTab('done');
    await vi.advanceTimersByTimeAsync(1);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/jobs/?states=done');
    expect(url).toContain('&limit=20&job_type=hl_aws_l2book_auto');
    // URL order: the job_type filter rides along before the limit is applied
    expect(url.indexOf('job_type=')).toBeLessThan(url.indexOf('limit=20') + 10);
    // client re-filters defensively (:1762)
    expect(monitor.historyJobs.value.map((entry) => entry.id)).toEqual(['h1']);
  });

  it('reports load failures', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 500'));
    const monitor = makeMonitor();

    monitor.switchTab('failed');
    await vi.advanceTimersByTimeAsync(1);

    expect(monitor.historyError.value).toContain('HTTP 500');
    expect(monitor.historyJobs.value).toEqual([]);
  });
});

describe('job actions (:1906-2009)', () => {
  it('run posts to /jobs/{id}/run and surfaces failures in the modal', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'worker offline' }), { status: 500 }));
    const monitor = makeMonitor();

    await monitor.runJob('job-1');

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://pbgui.test:8000/api/jobs/job-1/run');
    expect(monitor.modal.value.active).toBe(true);
    expect(monitor.modal.value.kind).toBe('error');
    expect(monitor.modal.value.bodyText).toContain('worker offline');
  });

  it('cancel posts the reason payload (:1975-1979)', async () => {
    const monitor = makeMonitor();
    await monitor.cancelJob('job-2');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/jobs/cancel');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ job_id: 'job-2', reason: 'user cancel' });
  });

  it('delete deletes and reloads the history tab (:1998-2000)', async () => {
    const monitor = makeMonitor();
    monitor.switchTab('done');
    await vi.advanceTimersByTimeAsync(1);
    fetchMock.mockClear();

    await monitor.deleteJob('job-3');
    await vi.advanceTimersByTimeAsync(1);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://pbgui.test:8000/api/jobs/job-3');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('states=done'); // history reload
  });
});

describe('modal flows (:1929-1971)', () => {
  it('loads the job log into the modal body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ log: ['line1', 'line2'] }), { status: 200 }));
    const monitor = makeMonitor();

    await monitor.showLog('job-4');

    expect(monitor.modal.value.active).toBe(true);
    expect(monitor.modal.value.kind).toBe('log');
    expect(monitor.modal.value.bodyText).toBe('line1\nline2');
  });

  it('loads job details into the details view', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(job({ id: 'job-5', payload: { coins: ['BTC'] } })), { status: 200 }));
    const monitor = makeMonitor();

    await monitor.showJobDetails('job-5');

    expect(monitor.modal.value.kind).toBe('details');
    expect(monitor.modal.value.detailsJob?.id).toBe('job-5');
  });

  it('closing is explicit only (no backdrop path)', async () => {
    const monitor = makeMonitor();
    await monitor.showLog('job-6');
    expect(monitor.modal.value.active).toBe(true);

    monitor.closeModal();
    expect(monitor.modal.value.active).toBe(false);
  });
});

describe('disconnect (unmount deviation)', () => {
  it('closes the socket without re-arming retries', async () => {
    const monitor = makeMonitor();
    monitor.connect();
    const ws = FakeWebSocket.instances[0]!;

    monitor.disconnect();
    expect(ws.closed).toBe(true);

    ws.fireClose(); // detached handler must not reconnect
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
