import { describe, expect, it } from 'vitest';
import { createI18n } from '@/shared/i18n';
import { buildDisplayRangeLoadingSummary, currentRangeMax, normalizeViewRange } from './viewRange';

/* normalizeViewRange (:1986-2001) + currentRangeMax (:2003-2007)
 * + the loading summary (:2163-2173, M-v7-5 handoff 3). */

const i18n = createI18n('en');
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});

describe('normalizeViewRange', () => {
  it('returns null when full mode is off', () => {
    expect(normalizeViewRange({ start: 0, end: 10, max: 10 }, 10, false)).toBeNull();
  });

  it('returns null for missing or non-positive totals', () => {
    expect(normalizeViewRange(null, 0, true)).toBeNull();
    expect(normalizeViewRange(null, -5, true)).toBeNull();
    expect(normalizeViewRange(null, null, true)).toBeNull();
  });

  it('defaults to the first min(500, max) configs', () => {
    expect(normalizeViewRange(null, 1200, true)).toEqual({ start: 0, end: 500, max: 1200 });
    expect(normalizeViewRange(null, 300, true)).toEqual({ start: 0, end: 300, max: 300 });
  });

  it('keeps explicit ranges', () => {
    expect(normalizeViewRange({ start: 40, end: 900 }, 1000, true)).toEqual({ start: 40, end: 900, max: 1000 });
  });

  it('clamps into [0, max] and keeps end >= start', () => {
    expect(normalizeViewRange({ start: -20, end: 5000 }, 1000, true)).toEqual({ start: 0, end: 1000, max: 1000 });
    expect(normalizeViewRange({ start: 700, end: 100 }, 1000, true)).toEqual({ start: 700, end: 700, max: 1000 });
  });

  it('falls back per-field when values are missing', () => {
    expect(normalizeViewRange({ start: 10 }, 1000, true)).toEqual({ start: 10, end: 500, max: 1000 });
    expect(normalizeViewRange({ end: 90 }, 1000, true)).toEqual({ start: 0, end: 90, max: 1000 });
  });

  it('treats non-finite values as missing (:1996-1997)', () => {
    expect(normalizeViewRange({ start: Number.NaN, end: Number.NaN }, 1000, true)).toEqual({ start: 0, end: 500, max: 1000 });
  });
});

describe('currentRangeMax', () => {
  it('prefers view_range.max', () => {
    expect(currentRangeMax({ view_range: { max: 900 }, load_stats: { selected_configs: 100 } })).toBe(900);
  });

  it('falls back to load_stats.selected_configs', () => {
    expect(currentRangeMax({ load_stats: { selected_configs: 100 } })).toBe(100);
  });

  it('is 0 without load data or with junk values', () => {
    expect(currentRangeMax(null)).toBe(0);
    expect(currentRangeMax({})).toBe(0);
    expect(currentRangeMax({ view_range: { max: Number.NaN } })).toBe(0);
  });
});

describe('buildDisplayRangeLoadingSummary (:2163-2173)', () => {
  it('translates the animated fill into loaded-of-target visible counts', () => {
    // total 1000, range 100..600; 50% fill → loadedEnd = min(600, max(100, 500)) = 500
    const summary = buildDisplayRangeLoadingSummary(50, { start: 100, end: 600, max: 1000 }, 1000, t);
    expect(summary).toBe('Loading display range: 400 / 500 configs (Rank 101-600)');
  });

  it('caps the loaded end at the target end and never reports negatives', () => {
    // 95% fill of 1000 = 950 → capped to 600; 1% fill = 10 → clamped up to start
    expect(buildDisplayRangeLoadingSummary(95, { start: 100, end: 600, max: 1000 }, 1000, t)).toBe(
      'Loading display range: 500 / 500 configs (Rank 101-600)'
    );
    expect(buildDisplayRangeLoadingSummary(1, { start: 100, end: 600, max: 1000 }, 1000, t)).toBe(
      'Loading display range: 0 / 500 configs (Rank 101-600)'
    );
  });
});
