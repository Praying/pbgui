import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIntegrityPolling } from './useIntegrityPolling';

/* Poll lifecycle gating — legacy stopIntegrityPolling/pollIntegrityJobs/
   startIntegrityPolling (market_data_main.html:4557-4605) with the
   setActivePanel start/stop wiring (:9066-9071, recon R5). */

const JOBS_PATH = '/jobs/?states=pending,running&limit=100';

function setup(overrides: Partial<Parameters<typeof useIntegrityPolling>[0]> = {}) {
  const fetchJobs = vi.fn<(path: string) => Promise<Record<string, unknown>>>();
  const reloadPanel = vi.fn(() => Promise.resolve());
  const controller = useIntegrityPolling({
    fetchJobs,
    isPanelActive: () => true,
    getSelectedExchange: () => 'bybit',
    isSaving: () => false,
    reloadPanel,
    ...overrides,
  });
  return { controller, fetchJobs, reloadPanel };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('poll chain (:4562-4605)', () => {
  it('fetches the pending/running jobs list immediately on start (:4568)', async () => {
    const { controller, fetchJobs } = setup();
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    expect(fetchJobs).toHaveBeenCalledWith(JOBS_PATH);
    expect(fetchJobs).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('reschedules the next tick 2 s after a tick settles (:4599)', async () => {
    const { controller, fetchJobs } = setup();
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchJobs).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchJobs).toHaveBeenCalledTimes(4);
    controller.stop();
  });

  it('dies silently when the panel is inactive — no fetch, no next tick (:4564-4565)', async () => {
    const { controller, fetchJobs } = setup({ isPanelActive: () => false });
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    expect(fetchJobs).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6000);
    expect(fetchJobs).not.toHaveBeenCalled();
  });

  it('keeps polling through fetch failures (:4596-4598)', async () => {
    const { controller, fetchJobs } = setup();
    fetchJobs.mockRejectedValue(new Error('network down'));
    controller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchJobs).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('marks a seen active job (:4590-4591)', async () => {
    const { controller, fetchJobs, reloadPanel } = setup();
    fetchJobs.mockResolvedValue({
      jobs: [{ type: 'ohlcv_integrity_scan', exchange: 'bybit' }],
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.hadActiveJob()).toBe(true);
    expect(reloadPanel).not.toHaveBeenCalled();
    controller.stop();
  });

  it('reloads the panel once when jobs go idle after activity (:4592-4595)', async () => {
    const { controller, fetchJobs, reloadPanel } = setup();
    fetchJobs.mockResolvedValueOnce({
      jobs: [{ type: 'ohlcv_integrity_scan', exchange: 'bybit' }],
    });
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(reloadPanel).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reloadPanel).toHaveBeenCalledTimes(1); // not sticky
    controller.stop();
  });

  it('skips the idle reload while a save is in flight but keeps the flag (:4592)', async () => {
    let saving = true;
    const { controller, fetchJobs, reloadPanel } = setup({ isSaving: () => saving });
    fetchJobs.mockResolvedValueOnce({
      jobs: [{ type: 'ohlcv_integrity_repair', exchange: 'bybit' }],
    });
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(reloadPanel).not.toHaveBeenCalled();
    expect(controller.hadActiveJob()).toBe(true);
    saving = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(reloadPanel).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('queues operations mark the poll active without a fetch (:4644)', () => {
    const { controller, fetchJobs } = setup();
    controller.markActiveJob();
    expect(controller.hadActiveJob()).toBe(true);
    expect(fetchJobs).not.toHaveBeenCalled();
  });
});

describe('start/stop lifecycle (:4557-4561, :4602-4605)', () => {
  it('stop cancels the pending next tick (:4557-4560)', async () => {
    const { controller, fetchJobs } = setup();
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    controller.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchJobs).toHaveBeenCalledTimes(1);
  });

  it('start is idempotent — no double chain (R5 hardening)', async () => {
    const { controller, fetchJobs } = setup();
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    controller.start();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJobs).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchJobs).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('drops an in-flight tick that resolves after stop (R4 generation guard)', async () => {
    const { controller, fetchJobs } = setup();
    let release: (value: Record<string, unknown>) => void = () => undefined;
    fetchJobs.mockImplementation(
      () => new Promise((resolve) => (release = resolve))
    );
    controller.start();
    controller.stop(); // mid-flight
    release({ jobs: [] });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchJobs).toHaveBeenCalledTimes(1); // chain did not resurrect
  });

  it('restart after stop begins a fresh chain', async () => {
    const { controller, fetchJobs } = setup();
    fetchJobs.mockResolvedValue({ jobs: [] });
    controller.start();
    controller.stop();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJobs).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  it('reports polling state', () => {
    const { controller } = setup();
    expect(controller.isPolling()).toBe(false);
    controller.start();
    expect(controller.isPolling()).toBe(true);
    controller.stop();
    expect(controller.isPolling()).toBe(false);
  });
});
