import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCHEDULE_POLL_INTERVAL_MS,
  useSchedulePolling,
  type SchedulesPayload,
} from './useSchedulePolling';

/* M-data-7 — the 15 s copy-data schedule poll, panel-gated like M-data-5's
   integrity chain (legacy market_data_main.html :5062-5153, recon R5):
     stopCopyDataSchedulePoll :5062-5067
     loadCopyDataSchedules    :5127-5153 (requestId staleness, error surface
                                    only when showErrors, reschedule in the
                                    finally — but only while the panel is
                                    active and the request is current) */

interface TimerBag {
  setTimeoutFn: typeof setTimeout;
  clearTimeoutFn: typeof clearTimeout;
  advance: () => void;
  armed: () => number;
}

function timerBag(): TimerBag {
  const entries: { cb: () => void; id: number }[] = [];
  const active = new Set<number>();
  let handle = 0;
  return {
    setTimeoutFn: ((cb: () => void, _ms?: number) => {
      handle += 1;
      active.add(handle);
      entries.push({ cb, id: handle });
      return handle;
    }) as typeof setTimeout,
    clearTimeoutFn: ((h: unknown) => {
      active.delete(h as number);
    }) as typeof clearTimeout,
    advance: () => {
      const next = entries.shift();
      if (!next) return;
      if (!active.has(next.id)) return; // clearTimeout cancelled this one
      active.delete(next.id);
      next.cb();
    },
    armed: () => active.size,
  };
}

describe('SCHEDULE_POLL_INTERVAL_MS (:5148-5150)', () => {
  it('is the legacy 15 s interval', () => {
    expect(SCHEDULE_POLL_INTERVAL_MS).toBe(15000);
  });
});

describe('useSchedulePolling', () => {
  let fetchSchedules: ReturnType<typeof vi.fn>;
  let onSchedules: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let isPanelActive: ReturnType<typeof vi.fn>;
  let timers: TimerBag;

  beforeEach(() => {
    fetchSchedules = vi.fn(async () => ({ schedules: [{ id: 's1' }] }));
    onSchedules = vi.fn();
    onError = vi.fn();
    isPanelActive = vi.fn(() => true);
    timers = timerBag();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makePoll() {
    return useSchedulePolling({
      fetchSchedules: fetchSchedules as unknown as () => Promise<SchedulesPayload>,
      onSchedules,
      onError,
      isPanelActive,
      failureMessage: () => 'market.failedLoadCopySchedules',
      serverMessage: (message: string) => `srv:${message}`,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });
  }

  it('emits the schedule list on success (:5137-5138)', async () => {
    const poll = makePoll();
    await poll.load(true);
    expect(onSchedules).toHaveBeenCalledWith([{ id: 's1' }]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reschedules itself after 15 s while the panel stays active (:5146-5151)', async () => {
    const poll = makePoll();
    await poll.load(true);
    expect(timers.armed()).toBe(1);
    fetchSchedules.mockResolvedValue({ schedules: [] });
    timers.advance(); // the timer callback starts load(false)
    await vi.waitFor(() => expect(timers.armed()).toBe(1)); // chain continues
    expect(fetchSchedules).toHaveBeenCalledTimes(2);
  });

  it('does not reschedule while the panel is inactive (:5147 chain death)', async () => {
    const poll = makePoll();
    isPanelActive.mockReturnValue(false);
    await poll.load(true);
    expect(timers.armed()).toBe(0);
  });

  it('stops the pending timer without fetching (stopCopyDataSchedulePoll :5062-5067)', async () => {
    const poll = makePoll();
    await poll.load(true);
    expect(timers.armed()).toBe(1);
    poll.stop();
    expect(timers.armed()).toBe(0);
    timers.advance(); // stale callback if any — must not fetch again
    expect(fetchSchedules).toHaveBeenCalledTimes(1);
  });

  it('drops a stale response superseded by a newer load (:5133/:5140)', async () => {
    const poll = makePoll();
    let releaseFirst: (value: unknown) => void = () => undefined;
    fetchSchedules.mockImplementationOnce(
      () => new Promise((resolve) => (releaseFirst = resolve))
    );
    const first = poll.load(true);
    await poll.load(true); // bumps the requestId past the in-flight one
    releaseFirst({ schedules: [{ id: 'stale' }] });
    await first;
    expect(onSchedules).toHaveBeenCalledTimes(1);
    expect(onSchedules).not.toHaveBeenCalledWith([{ id: 'stale' }]);
  });

  it('surfaces errors only when showErrors is set (:5141-5144)', async () => {
    const poll = makePoll();
    fetchSchedules.mockRejectedValue(new Error('HTTP 500'));
    await poll.load(true);
    expect(onError).toHaveBeenCalledWith('srv:HTTP 500');
    onError.mockClear();
    await poll.load(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it('falls back to the failure key when the error has no message (:5142)', async () => {
    const poll = makePoll();
    fetchSchedules.mockRejectedValue('nope');
    await poll.load(true);
    expect(onError).toHaveBeenCalledWith('market.failedLoadCopySchedules');
  });

  it('treats success:false payloads as failures with the server error (:5134-5136)', async () => {
    const poll = makePoll();
    fetchSchedules.mockResolvedValue({ success: false, error: 'conflict' });
    await poll.load(true);
    expect(onError).toHaveBeenCalledWith('srv:conflict');
  });

  it('keeps polling after an error (:5145-5151 finally)', async () => {
    const poll = makePoll();
    fetchSchedules.mockRejectedValue(new Error('HTTP 503'));
    await poll.load(true);
    expect(timers.armed()).toBe(1);
  });

  it('always stops the pending timer before a fresh load (:5128)', async () => {
    const poll = makePoll();
    await poll.load(true);
    expect(timers.armed()).toBe(1);
    fetchSchedules.mockResolvedValue({ schedules: [] });
    await poll.load(false);
    // the first timer was cleared; exactly one armed timer remains
    expect(timers.armed()).toBe(1);
  });
});
