import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoadProgress, type LoadProgressDeps } from './useLoadProgress';
import { createI18n } from '@/shared/i18n';
import type { LoadStatusData } from '../types';

/* The two pareto progress surfaces — full-load bar (:2414-2491, 90 ms tick)
 * and display-range slider fill (:2157-2214, 120 ms tick) — plus the
 * /load-status job poll (:2520-2555). */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});

function makeDeps(overrides: Partial<LoadProgressDeps> = {}): LoadProgressDeps {
  return {
    t,
    loadStatus: vi.fn(async () => ({})),
    isFullLoadPending: () => false,
    ownsJob: () => true,
    currentJobId: () => '',
    releaseJob: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setFullLoadStatus (:2414-2451 minus DOM)', () => {
  it('classifies stage, clamps progress 0-100 and records text', () => {
    const p = useLoadProgress(makeDeps());
    p.setFullLoadStatus('loading', 'scanning', 140);
    expect(p.fullLoad.stage).toBe('loading');
    expect(p.fullLoad.text).toBe('scanning');
    expect(p.fullLoad.target).toBe(100);

    p.setFullLoadStatus('loaded', 'done', -3);
    expect(p.fullLoad.stage).toBe('loaded');
    expect(p.fullLoad.target).toBe(0);
  });

  it('snaps the animated display for terminal stages or backwards targets', () => {
    const p = useLoadProgress(makeDeps());
    p.setFullLoadStatus('loading', 'x', 80);
    expect(p.fullLoad.display).toBe(0); // animation eases up
    p.setFullLoadStatus('loaded', 'done', 100);
    expect(p.fullLoad.display).toBe(100);
    p.setFullLoadStatus('loading', 'again', 40);
    expect(p.fullLoad.display).toBe(40); // backwards target snaps down
  });

  it('stops any running animation when the display is already at target', () => {
    const p = useLoadProgress(makeDeps({ isFullLoadPending: () => true }));
    p.setFullLoadStatus('loading', 'x', 80);
    vi.advanceTimersByTime(90); // one ease tick
    const displayAfterTick = p.fullLoad.display;
    expect(displayAfterTick).toBeGreaterThan(0);
    p.setFullLoadStatus('loaded', 'done', 100);
    expect(p.fullLoad.display).toBe(100);
    const before = p.fullLoad.display;
    vi.advanceTimersByTime(900);
    expect(p.fullLoad.display).toBe(before); // interval cleared
  });
});

describe('full-load animation easing (:2467-2491, 90 ms interval)', () => {
  it('eases forward with max(0.4, diff*0.18) steps and lands on target', () => {
    const p = useLoadProgress(makeDeps({ isFullLoadPending: () => true }));
    p.setFullLoadStatus('loading', 'x', 10);
    vi.advanceTimersByTime(90);
    expect(p.fullLoad.display).toBeCloseTo(1.8, 5); // diff 10 → step max(0.4, 1.8)
    vi.advanceTimersByTime(90 * 20);
    expect(p.fullLoad.display).toBe(10); // snapped within 0.2
  });

  it('stops the interval once pending clears after landing (:2483-2486)', () => {
    let pending = true;
    const p = useLoadProgress(makeDeps({ isFullLoadPending: () => pending }));
    p.setFullLoadStatus('loading', 'x', 10);
    vi.advanceTimersByTime(90 * 30);
    expect(p.fullLoad.display).toBe(10);
    // legacy keeps the 90 ms interval alive while a load is pending
    expect(p.isAnimating()).toBe(true);
    pending = false;
    vi.advanceTimersByTime(90);
    expect(p.isAnimating()).toBe(false);
    const frozen = p.fullLoad.display;
    vi.advanceTimersByTime(90 * 10);
    expect(p.fullLoad.display).toBe(frozen);
  });

  it('stops immediately when the eased display reaches 100 (:2483)', () => {
    const p = useLoadProgress(makeDeps({ isFullLoadPending: () => true }));
    p.setFullLoadStatus('loaded', 'done', 100); // terminal → snapped
    vi.advanceTimersByTime(90); // first tick applies the stop condition
    expect(p.isAnimating()).toBe(false);
  });
});

describe('updateFullLoadPhase (:2493-2505)', () => {
  it('maps the refresh pipeline phases to progress targets', () => {
    const p = useLoadProgress(makeDeps());
    p.updateFullLoadPhase('command_center');
    expect(p.fullLoad.stage).toBe('loading');
    expect(p.fullLoad.target).toBe(74);
    p.updateFullLoadPhase('deep_intelligence_panel');
    expect(p.fullLoad.target).toBe(97);
    p.updateFullLoadPhase('complete', '+3 configs');
    expect(p.fullLoad.stage).toBe('loaded');
    expect(p.fullLoad.target).toBe(100);
    expect(p.fullLoad.text).toBe('Full result load completed. +3 configs');
  });

  it('falls back to the command_center phase for unknown names', () => {
    const p = useLoadProgress(makeDeps());
    p.updateFullLoadPhase('nonsense');
    expect(p.fullLoad.target).toBe(74);
  });
});

describe('display-range progress (:2157-2214)', () => {
  it('computes clamped percentages (:2157-2161)', () => {
    const p = useLoadProgress(makeDeps());
    expect(p.displayRangePercent(50, 200)).toBe(25);
    expect(p.displayRangePercent(500, 200)).toBe(100);
    expect(p.displayRangePercent(-5, 200)).toBe(0);
    expect(p.displayRangePercent(10, 0)).toBe(0);
  });

  it('starts from the current end and eases toward the target (:2182-2202)', () => {
    const p = useLoadProgress(makeDeps());
    // currently visible to 100 of 1000; requesting 500
    p.startDisplayRangeProgress({ start: 0, end: 500, max: 1000 }, 1000, 100);
    expect(p.displayRange.loading).toBe(true);
    expect(p.displayRange.target).toBe(50);
    expect(p.displayRange.display).toBe(10); // start percent
    vi.advanceTimersByTime(120);
    // cap = max(10, 50-0.8)=49.2, diff 39.2 → step max(0.25, 1.372)
    expect(p.displayRange.display).toBeCloseTo(10 + 1.372, 4);
  });

  it('finishes at target on success and at the visible percent on failure (:2204-2214)', () => {
    const p = useLoadProgress(makeDeps());
    p.startDisplayRangeProgress({ start: 0, end: 500, max: 1000 }, 1000, 100);
    p.finishDisplayRangeProgress(true, 300, 1000);
    expect(p.displayRange.display).toBe(50);
    expect(p.displayRange.loading).toBe(false);
    expect(p.displayRange.range).toBeNull();

    p.startDisplayRangeProgress({ start: 0, end: 800, max: 1000 }, 1000, 100);
    p.finishDisplayRangeProgress(false, 300, 1000);
    expect(p.displayRange.display).toBe(30);
    expect(p.displayRange.loading).toBe(false);
  });

  it('clears timers on dispose', () => {
    const p = useLoadProgress(makeDeps());
    p.startDisplayRangeProgress({ start: 0, end: 500, max: 1000 }, 1000, 100);
    p.setFullLoadStatus('loading', 'x', 80);
    p.dispose();
    const display = p.displayRange.display;
    const full = p.fullLoad.display;
    vi.advanceTimersByTime(5000);
    expect(p.displayRange.display).toBe(display);
    expect(p.fullLoad.display).toBe(full);
  });
});

describe('pollFullLoadStatus (:2520-2555)', () => {
  it('polls every 350 ms while loading and returns the payload', async () => {
    const responses: LoadStatusData[] = [
      { status: 'loading', job: { job_id: 'j1', progress: 10, message: 'scanning' } },
      { status: 'done', job: { job_id: 'j1', progress: 100, message: 'ready' }, payload: { mode: 'full' } },
    ];
    const loadStatus = vi.fn(async (): Promise<LoadStatusData> => responses.shift() ?? {});
    const releaseJob = vi.fn();
    const p = useLoadProgress(makeDeps({ loadStatus, releaseJob }));
    const promise = p.pollFullLoadStatus('j1');
    const advanced = vi.advanceTimersByTimeAsync(400);
    const data = await Promise.all([promise, advanced]).then(([d]) => d);
    expect(data).toEqual({ status: 'done', job: { job_id: 'j1', progress: 100, message: 'ready' }, payload: { mode: 'full' } });
    expect(loadStatus).toHaveBeenCalledTimes(2);
    expect(loadStatus).toHaveBeenNthCalledWith(1, '/load-status?job_id=j1');
    expect(releaseJob).toHaveBeenCalledWith('j1');
    // final "refreshing" status (:2551)
    expect(p.fullLoad.stage).toBe('loading');
    expect(p.fullLoad.target).toBeGreaterThanOrEqual(70);
  });

  it('re-polls after 200 ms when the status lacks a payload (:2541-2546)', async () => {
    const responses: LoadStatusData[] = [
      { status: 'done', job: { job_id: 'j1', progress: 97, message: 'finalizing' } },
      { status: 'done', job: { job_id: 'j1', progress: 100 }, payload: { ok: true } as never },
    ];
    const loadStatus = vi.fn(async (): Promise<LoadStatusData> => responses.shift() ?? {});
    const p = useLoadProgress(makeDeps({ loadStatus }));
    const promise = p.pollFullLoadStatus('j1');
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toEqual({ status: 'done', job: { job_id: 'j1', progress: 100 }, payload: { ok: true } });
    expect(loadStatus).toHaveBeenCalledTimes(2);
  });

  it('throws the server error for failed jobs (:2533-2540)', async () => {
    const releaseJob = vi.fn();
    const p = useLoadProgress(
      makeDeps({
        loadStatus: async () => ({ status: 'error', job: { job_id: 'j1', error: 'disk on fire' } }),
        releaseJob,
      })
    );
    await expect(p.pollFullLoadStatus('j1')).rejects.toThrow('disk on fire');
    expect(releaseJob).toHaveBeenCalledWith('j1');
  });

  it('throws when the status response has no job (:2524-2526)', async () => {
    const p = useLoadProgress(makeDeps({ loadStatus: async () => ({}) }));
    await expect(p.pollFullLoadStatus('j1')).rejects.toThrow();
  });

  it('resolves immediately with null without a job id (:2521-2522)', async () => {
    const loadStatus = vi.fn();
    const p = useLoadProgress(makeDeps({ loadStatus }));
    await expect(p.pollFullLoadStatus('')).resolves.toBeNull();
    expect(loadStatus).not.toHaveBeenCalled();
  });

  it('keeps polling for foreign jobs but does not release them (:2526)', async () => {
    const responses: LoadStatusData[] = [
      { status: 'loading', job: { job_id: 'j1', progress: 5, message: 'x' } },
      { status: 'done', job: { job_id: 'j1', progress: 100 }, payload: { ok: 1 } as never },
    ];
    const releaseJob = vi.fn();
    const p = useLoadProgress(makeDeps({ loadStatus: async (): Promise<LoadStatusData> => responses.shift() ?? {}, ownsJob: () => false, releaseJob }));
    const promise = p.pollFullLoadStatus('j1');
    await vi.advanceTimersByTimeAsync(400);
    await expect(promise).resolves.toMatchObject({ payload: { ok: 1 } });
    expect(releaseJob).not.toHaveBeenCalled();
  });
});
