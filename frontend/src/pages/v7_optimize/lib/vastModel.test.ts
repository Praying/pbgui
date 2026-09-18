import { describe, expect, it } from 'vitest';
import {
  buildChartSeries,
  canComparePerformanceRuns,
  formatPositionPair,
  hostStatusParts,
  isOfferCompatible,
  progressPercent,
} from './vastModel';
import type { VastPerformanceRun } from './vastTypes';

describe('Vast cloud view models', () => {
  it('rejects offers that do not meet hard runtime requirements', () => {
    expect(isOfferCompatible({ cuda_max_good: 12.9 }, 1)).toBe(false);
    expect(isOfferCompatible({ cuda_max_good: 13, duration_seconds: 3599 }, 1)).toBe(false);
    expect(isOfferCompatible({ cuda_max_good: 13, duration_seconds: 3600 }, 1)).toBe(true);
  });

  it('describes independent host evidence and preferences', () => {
    expect(hostStatusParts({ machine_id: 42, used: true, working: true, preferred: true })).toEqual([
      'Previously used',
      'Working',
      'Preferred',
    ]);
  });

  it('allows comparisons only for distinct verified runs with one workload fingerprint', () => {
    const first = { id: 'a'.repeat(32), fingerprint: 'f'.repeat(64) } as VastPerformanceRun;
    const second = { id: 'b'.repeat(32), fingerprint: 'f'.repeat(64) } as VastPerformanceRun;
    const other = { id: 'c'.repeat(32), fingerprint: 'e'.repeat(64) } as VastPerformanceRun;

    expect(canComparePerformanceRuns([first, second])).toBe(true);
    expect(canComparePerformanceRuns([first, first])).toBe(false);
    expect(canComparePerformanceRuns([first, other])).toBe(false);
    expect(canComparePerformanceRuns([first])).toBe(false);
  });

  it('builds chart points from monotonic counter intervals without bridging resets', () => {
    const points = buildChartSeries([
      { sampled_at: 1000, proxy_total: 100, exact_total: 10 },
      { sampled_at: 1060, proxy_total: 700, exact_total: 40 },
      { sampled_at: 1120, proxy_total: 20, exact_total: 2 },
      { sampled_at: 1180, proxy_total: 320, exact_total: 32 },
    ], 'proxy_total');

    expect(points).toEqual([
      { minutes: 1, rate: 600, seconds: 60 },
      null,
      { minutes: 3, rate: 300, seconds: 60 },
    ]);
  });

  it('normalizes progress and disabled-side position display', () => {
    expect(progressPercent(25, 100)).toBe(25);
    expect(progressPercent(150, 100)).toBe(100);
    expect(progressPercent(undefined, 0)).toBeNull();
    expect(formatPositionPair(4, 5, 1, 0)).toBe('4 / -');
    expect(formatPositionPair(0, 5, 1, 1)).toBe('- / 5');
  });
});
