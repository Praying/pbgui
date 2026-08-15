import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling';

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fn immediately on start', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    usePolling(fn, 5000).start();
    await vi.advanceTimersByTimeAsync(0);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-invokes fn on each interval tick', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);

    usePolling(fn, 5000).start();
    await vi.advanceTimersByTimeAsync(15000);

    expect(fn).toHaveBeenCalledTimes(4); // immediate run + 3 scheduled runs
  });

  it('does not overlap runs while the previous run is unsettled', async () => {
    let resolveRun!: () => void;
    const fn = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveRun = resolve; })
    );

    usePolling(fn, 5000).start();
    await vi.advanceTimersByTimeAsync(20000);

    // Legacy scheduleStatus only arms the next timeout after the previous
    // fetch settles — a hanging run must not stack a second one.
    expect(fn).toHaveBeenCalledTimes(1);

    resolveRun();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stops ticking after stop()', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const polling = usePolling(fn, 5000);

    polling.start();
    await vi.advanceTimersByTimeAsync(5000);
    polling.stop();
    await vi.advanceTimersByTimeAsync(60000);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps polling when fn rejects', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined);

    usePolling(fn, 5000).start();
    await vi.advanceTimersByTimeAsync(10000);

    expect(fn).toHaveBeenCalledTimes(3); // rejected run included, chain unbroken
  });

  it('ignores start() when already running', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const polling = usePolling(fn, 5000);

    polling.start();
    polling.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('restarts cleanly after stop()', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const polling = usePolling(fn, 5000);

    polling.start();
    await vi.advanceTimersByTimeAsync(5000);
    polling.stop();
    polling.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(fn).toHaveBeenCalledTimes(3); // run, tick, immediate restart run
  });
});
