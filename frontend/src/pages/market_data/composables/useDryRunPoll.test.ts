import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRY_RUN_MAX_ATTEMPTS,
  DRY_RUN_MAX_ERROR_ATTEMPTS,
  DRY_RUN_SLOW_INTERVAL_MS,
  DRY_RUN_FAST_INTERVAL_MS,
  useDryRunPoll,
} from './useDryRunPoll';

/* M-data-7 — the dry-run summary poll (legacy market_data_main.html
   :5256-5523):
     resetCopyDataDryRunSummary   :5256-5267
     scheduleCopyDataDryRun…Poll  :5478-5483 (900 ms while attempt<3 else 1800)
     pollCopyDataDryRunSummary    :5485-5511 (status render, done/failed →
                                             log fetch + merge + monitor
                                             remount, attempt caps 180/20)
     startCopyDataDryRunSummary   :5513-5522 */

interface TimerBag {
  setTimeoutFn: typeof setTimeout;
  clearTimeoutFn: typeof clearTimeout;
  advance: (n?: number) => void;
  armed: () => number;
  lastDelay: () => number;
}

function timerBag(): TimerBag {  const entries: { cb: () => void; id: number }[] = [];
  const active = new Set<number>();
  let handle = 0;
  let lastDelayMs = -1;
  return {
    setTimeoutFn: ((cb: () => void, ms?: number) => {
      handle += 1;
      active.add(handle);
      lastDelayMs = ms ?? -1;
      entries.push({ cb, id: handle });
      return handle;
    }) as typeof setTimeout,
    clearTimeoutFn: ((h: unknown) => {
      active.delete(h as number);
    }) as typeof clearTimeout,
    advance: (n = 1) => {
      for (let i = 0; i < n; i += 1) {
        const next = entries.shift();
        if (!next) return;
        active.delete(next.id);
        next.cb();
      }
    },
    armed: () => active.size,
    lastDelay: () => lastDelayMs,
  };
}

/** One macrotask tick — enough for a mockResolvedValue poll to settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('poll constants (:5482, :5502, :5507)', () => {
  it('keeps the legacy backoff and attempt caps', () => {
    expect(DRY_RUN_FAST_INTERVAL_MS).toBe(900);
    expect(DRY_RUN_SLOW_INTERVAL_MS).toBe(1800);
    expect(DRY_RUN_MAX_ATTEMPTS).toBe(180);
    expect(DRY_RUN_MAX_ERROR_ATTEMPTS).toBe(20);
  });
});

describe('useDryRunPoll', () => {
  let fetchJob: ReturnType<typeof vi.fn>;
  let fetchLog: ReturnType<typeof vi.fn>;
  let render: ReturnType<typeof vi.fn>;
  let onFinished: ReturnType<typeof vi.fn>;
  let timers: TimerBag;

  beforeEach(() => {
    fetchJob = vi.fn(async () => ({ status: 'running' }));
    fetchLog = vi.fn(async () => ({ log: [] }));
    render = vi.fn();
    onFinished = vi.fn();
    timers = timerBag();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makePoll() {
    return useDryRunPoll({
      fetchJob: fetchJob as unknown as () => Promise<Record<string, unknown>>,
      fetchLog: fetchLog as unknown as () => Promise<Record<string, unknown>>,
      render,
      onFinished,
      translate: (key: string, params?: Record<string, unknown>) =>
        Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), key),
      serverMessage: (message: string) => `srv:${message}`,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });
  }

  it('renders the queued summary immediately and polls attempt 0 (:5513-5521)', async () => {
    const poll = makePoll();
    poll.start({ job_id: 'job-1' });
    expect(render).toHaveBeenCalledWith({ result: { job_id: 'job-1' }, status: 'queued' });
    await vi.waitFor(() => expect(fetchJob).toHaveBeenCalledWith('job-1'));
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('ignores a result without a job id (:5487-5488)', async () => {
    const poll = makePoll();
    poll.start({ job_id: '' });
    poll.start({ job_id: '   ' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchJob).not.toHaveBeenCalled();
    expect(timers.armed()).toBe(0);
  });

  it('renders each running status and keeps scheduling (:5491-5493, :5502)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValue({ status: 'running' });
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    expect(render).toHaveBeenLastCalledWith({
      result: { job_id: 'job-1' },
      job: { status: 'running' },
      status: 'running',
      stats: {},
    });
    expect(timers.armed()).toBe(1);
  });

  it('uses fast backoff for the first three attempts then slows down (:5482)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValue({ status: 'running' });
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(timers.armed()).toBe(1));
    expect(timers.lastDelay()).toBe(DRY_RUN_FAST_INTERVAL_MS);
    timers.advance(); // attempt 1
    await vi.waitFor(() => expect(timers.armed()).toBe(1));
    expect(timers.lastDelay()).toBe(DRY_RUN_FAST_INTERVAL_MS);
    timers.advance(); // attempt 2
    await vi.waitFor(() => expect(timers.armed()).toBe(1));
    expect(timers.lastDelay()).toBe(DRY_RUN_FAST_INTERVAL_MS);
    timers.advance(); // attempt 3
    await vi.waitFor(() => expect(timers.armed()).toBe(1));
    expect(timers.lastDelay()).toBe(DRY_RUN_SLOW_INTERVAL_MS);
  });

  it('defaults a missing job status to running (:5491)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValue({});
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    expect(render.mock.calls[1]![0]).toMatchObject({ status: 'running' });
  });

  it('fetches the log, merges structured + log stats and stops on done (:5494-5500)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValueOnce({
      status: 'done',
      progress: {
        last_result: {
          dry_run: true,
          files_total: 10,
          total_size_bytes: 2048,
          exchange_stats: [
            { label: 'Bitget', files_transferred: 4, transfer_size_bytes: 1024, remote_path: '/srv/bitget' },
          ],
        },
      },
    });
    fetchLog.mockResolvedValue({
      log: [
        'remote=/srv/bitget',
        'Number of regular files transferred: 6',
        'duration=9s',
      ],
    });
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(fetchLog).toHaveBeenCalledWith('job-1'));
    expect(onFinished).toHaveBeenCalledTimes(1); // mountCopyDataJobMonitor(true)
    expect(timers.armed()).toBe(0); // chain ended
    const last = render.mock.calls.at(-1)![0] as {
      status: string;
      error: string;
      stats: Record<string, unknown>;
    };
    expect(last.status).toBe('done');
    expect(last.error).toBe('');
    // structured wins where present; log parser fills the gaps (merge :5342)
    expect(last.stats.files_total).toBe('10');
    expect(last.stats.total_size).toBe('2.00 KB');
    expect(last.stats.files_transferred).toBe('6');
    expect(last.stats.duration).toBe('9s');
    expect(last.stats.remote_paths).toEqual(['/srv/bitget']);
  });

  it('surfaces the job error on failure with the fallback key (:5498)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValueOnce({ status: 'failed', error: 'rsync blew up' });
    fetchLog.mockResolvedValue({ log: [] });
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    const last = render.mock.calls.at(-1)![0] as { status: string; error: string };
    expect(last.status).toBe('failed');
    expect(last.error).toBe('rsync blew up');
  });

  it('falls back to the dryRunFailed key when the failed job carries no error', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValueOnce({ status: 'failed' });
    fetchLog.mockResolvedValue({ log: [] });
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    const last = render.mock.calls.at(-1)![0] as { error: string };
    expect(last.error).toBe('market.dryRunFailed');
  });

  it('renders the unknown status and keeps retrying on fetch errors while attempts remain (:5505-5509)', async () => {
    const poll = makePoll();
    fetchJob.mockRejectedValue(new Error('HTTP 500'));
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    expect(render.mock.calls[1]![0]).toEqual({
      result: { job_id: 'job-1' },
      status: 'unknown',
      error: 'srv:HTTP 500',
    });
    expect(timers.armed()).toBe(1);
  });

  it('stops after 20 error attempts (:5507)', async () => {
    const poll = makePoll();
    fetchJob.mockRejectedValue(new Error('HTTP 500'));
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    for (let i = 0; i < 19; i += 1) {
      timers.advance();
      await flush(); // poll(i+1) renders its error + re-arms
    }
    expect(timers.armed()).toBe(1); // attempt 19 still re-arms (19 < 20)
    timers.advance(); // attempt 20 — the last permitted one
    await flush();
    await vi.waitFor(() => expect(timers.armed()).toBe(0));
  });

  it('stops after 180 running attempts (:5502)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValue({ status: 'running' });
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(timers.armed()).toBe(1));
    for (let i = 0; i < 179; i += 1) {
      timers.advance();
      await flush();
    }
    expect(timers.armed()).toBe(1); // attempt 179 still re-arms (179 < 180)
    timers.advance(); // attempt 180 — the cap
    await flush();
    await vi.waitFor(() => expect(timers.armed()).toBe(0));
  });

  it('a restart drops the old chain (requestId staleness :5518)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValue({ status: 'running' });
    poll.start({ job_id: 'job-old' });
    await vi.waitFor(() => expect(timers.armed()).toBe(1));
    poll.start({ job_id: 'job-new' });
    await vi.waitFor(() => expect(fetchJob).toHaveBeenLastCalledWith('job-new'));
    expect(timers.armed()).toBe(1); // only the new chain's timer
    timers.advance(); // fire whatever the old chain armed — must be a no-op
    await flush();
    expect(fetchJob).toHaveBeenLastCalledWith('job-new');
  });

  it('reset stops the chain and stales in-flight polls (:5256-5267)', async () => {
    const poll = makePoll();
    fetchJob.mockResolvedValue({ status: 'running' });
    poll.start({ job_id: 'job-1' });
    await vi.waitFor(() => expect(timers.armed()).toBe(1));
    poll.reset();
    expect(timers.armed()).toBe(0);
    timers.advance(); // stale callback — no new fetch, no schedule
    const calls = fetchJob.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchJob.mock.calls.length).toBe(calls);
    expect(timers.armed()).toBe(0);
  });
});
