import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoot } from '@/shared/boot';
import type { CoinDataState } from '../types';
import { useRefreshJobs } from './useRefreshJobs';

/* The refresh-job engine port of coin_data.html :2036-2262: POST contract,
   350 ms job polling, completed-state application and error surfacing. */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

const fetchMock = vi.fn();

function jobFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    title: 'Refreshing binance...',
    message: 'binance: fetching markets...',
    status: 'running',
    percent: 10,
    step: 1,
    total: 6,
    result_message: '',
    error: '',
    state: null,
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

/**
 * POST n returns job_id `job-<n>` and arms that job's status queue; each poll
 * of `/refresh/jobs/job-<n>` shifts the queue (last entry repeats). This keeps
 * concurrent poll chains (the "newest wins" contract) routed independently.
 */
function makeJobs(queues: Array<Array<{ status: string; state?: unknown; error?: string; result_message?: string }>>) {
  const state: Record<string, Array<Record<string, unknown>>> = {};
  let posts = 0;
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/refresh/jobs/')) {
      const match = /\/refresh\/jobs\/(job-\d+)/.exec(u);
      const id = match?.[1] ?? 'job-0';
      const queue = state[id] ?? queues[0] ?? [{ status: 'completed' }];
      const entry = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve(new Response(JSON.stringify({ job: jobFixture({ id, ...entry }) }), { status: 200 }));
    }
    if (init?.method === 'POST') {
      const jobId = `job-${posts}`;
      state[jobId] = [...(queues[posts] ?? [{ status: 'completed' }])];
      posts += 1;
      return Promise.resolve(new Response(JSON.stringify({ ok: true, job_id: jobId }), { status: 200 }));
    }
    return Promise.reject(new Error('unexpected fetch ' + u));
  });
}

function makeStore(applyState = vi.fn(), setStatus = vi.fn()) {
  return useRefreshJobs({
    t: (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}`,
    getPayload: () => ({ exchange: 'binance', market_cap: 0, vol_mcap: 10, tags: ['meme'], only_cpt: false }),
    applyState,
    setStatus,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('runRefresh POST contract (:2230-2262)', () => {
  it('posts the filter payload with the bearer header', async () => {
    makeJobs([[{ status: 'completed', state: { counts: { main: 0 } } }]]);
    const jobs = makeStore();

    void jobs.runRefresh('/refresh/exchange', 'Busy', 'Done');
    await vi.advanceTimersByTimeAsync(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://pbgui.test:8000/api/coin-data/refresh/exchange');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toEqual({
      exchange: 'binance',
      market_cap: 0,
      vol_mcap: 10,
      tags: ['meme'],
      only_cpt: false,
    });
  });

  it('surfaces the API detail on rejection (:2246-2248)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'No active local CoinMarketCap pool key is available' }), { status: 409 })
    );
    const applyState = vi.fn();
    const setStatus = vi.fn();
    const jobs = makeStore(applyState, setStatus);

    await jobs.runRefresh('/refresh/cmc', 'Busy', 'Done');

    expect(applyState).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(
      expect.stringContaining('409'),
      true
    );
    expect(setStatus).toHaveBeenCalledWith(
      expect.stringContaining('No active local CoinMarketCap pool key is available'),
      true
    );
    expect(jobs.busy.value.visible).toBe(false);
  });

  it('errors when the reply carries no job id (:2253-2255)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const setStatus = vi.fn();
    const jobs = makeStore(vi.fn(), setStatus);

    await jobs.runRefresh('/refresh/exchange', 'Busy', 'Done');

    expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('market.refreshNoJobId'), true);
  });
});

describe('job polling (:2184-2228)', () => {
  it('polls every 350 ms and applies the completed embedded state', async () => {
    const completedState = { counts: { main: 7 } } as unknown as CoinDataState;
    makeJobs([
      [
        { status: 'running' },
        { status: 'running' },
        { status: 'completed', state: completedState, result_message: 'Refreshed binance' },
      ],
    ]);
    const applyState = vi.fn();
    const setStatus = vi.fn();
    const jobs = makeStore(applyState, setStatus);

    void jobs.runRefresh('/refresh/exchange', 'Refreshing binance', 'fallback ok');
    await vi.advanceTimersByTimeAsync(0);

    expect(jobs.busy.value.visible).toBe(true);
    expect(setStatus).toHaveBeenCalledWith('Refreshing binance...', false);

    await vi.advanceTimersByTimeAsync(350);
    expect(jobs.busy.value.percent).toBe(10);

    await vi.advanceTimersByTimeAsync(350 * 2);
    expect(applyState).toHaveBeenCalledWith(completedState);
    expect(setStatus).toHaveBeenCalledWith('Refreshed binance', false);
    expect(jobs.busy.value.visible).toBe(false);
  });

  it('stops polling and reports the error message on a failed job (:2204-2207)', async () => {
    makeJobs([[{ status: 'error', error: 'Failed to refresh binance: boom' }]]);
    const applyState = vi.fn();
    const setStatus = vi.fn();
    const jobs = makeStore(applyState, setStatus);

    void jobs.runRefresh('/refresh/exchange', 'Busy', 'fallback');
    await vi.advanceTimersByTimeAsync(0);

    expect(applyState).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith('Failed to refresh binance: boom', true);
    expect(jobs.busy.value.visible).toBe(false);

    const polls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/refresh/jobs/')).length;
    await vi.advanceTimersByTimeAsync(2000);
    const pollsAfter = fetchMock.mock.calls.filter((call) => String(call[0]).includes('/refresh/jobs/')).length;
    expect(pollsAfter).toBe(polls); // interval cleared
  });

  it('keeps only the newest job poll active (:2211-2213)', async () => {
    makeJobs([
      [{ status: 'running' }, { status: 'completed', state: { marker: 'one' }, result_message: 'one ok' }],
      [{ status: 'running' }],
    ]);
    const applyState = vi.fn();
    const jobs = makeStore(applyState, vi.fn());

    void jobs.runRefresh('/refresh/exchange', 'One', 'one ok');
    await vi.advanceTimersByTimeAsync(350); // initial poll (running) + tick (completed) → applied
    expect(applyState).toHaveBeenCalledTimes(1);

    void jobs.runRefresh('/refresh/all', 'Two', 'two ok');
    await vi.advanceTimersByTimeAsync(5000); // the second chain keeps polling, applies nothing

    expect(applyState).toHaveBeenCalledTimes(1); // first chain dropped by the second start
  });
});
