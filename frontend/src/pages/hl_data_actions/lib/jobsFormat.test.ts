import { describe, expect, it } from 'vitest';
import {
  buildDateValueToMs,
  calcPct,
  compareActiveJobs,
  fmtBytes,
  fmtDay,
  fmtTS,
  formatJobDuration,
  inputToDay,
} from './jobsFormat';

/* Verbatim ports of hl_data_actions.html :634-635, :1288-1299, :1821-1852,
   :2025-2052. */

describe('calcPct (:2025-2030)', () => {
  it('returns 0 without a total', () => {
    expect(calcPct({})).toBe(0);
  });

  it('blends step and chunk progress, clamped to 0-100', () => {
    expect(calcPct({ step: 2, total: 4, chunk_done: 5, chunk_total: 10 })).toBe(38); // (2-1+0.5)/4
    expect(calcPct({ step: 1, total: 1, chunk_done: 0, chunk_total: 0 })).toBe(0); // (1-1+0)/1
    expect(calcPct({ step: 9, total: 4, chunk_done: 0, chunk_total: 1 })).toBe(100);
  });
});

describe('fmtBytes (:2031-2036)', () => {
  it('formats byte magnitudes with two decimals', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(1024)).toBe('1.00 KB');
    expect(fmtBytes(1536)).toBe('1.50 KB');
    expect(fmtBytes(1024 * 1024)).toBe('1.00 MB');
  });
});

describe('fmtTS (:2037-2043)', () => {
  it('renders epoch seconds as local yyyy-mm-dd hh:mm:ss', () => {
    expect(fmtTS(1700000000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('passes through empties and garbage', () => {
    expect(fmtTS(0)).toBe('');
    expect(fmtTS('weird')).toBe('weird');
  });
});

describe('compareActiveJobs (:2044-2052)', () => {
  it('orders running before pending, then oldest created, then id', () => {
    const jobs = [
      { id: 'c', status: 'pending', created_ts: 1 },
      { id: 'a', status: 'running', created_ts: 5 },
      { id: 'b', status: 'running', created_ts: 4 },
      { id: 'd', status: 'pending', created_ts: 0 },
    ];
    expect(jobs.slice().sort(compareActiveJobs).map((job) => job.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('fmtDay / inputToDay (:634-635)', () => {
  it('converts between yyyymmdd and yyyy-mm-dd', () => {
    expect(fmtDay('20240102')).toBe('2024-01-02');
    expect(fmtDay('2024010')).toBe('');
    expect(fmtDay(null)).toBe('');
    expect(inputToDay('2024-01-02')).toBe('20240102');
    expect(inputToDay('')).toBe('');
  });
});

describe('formatJobDuration (:1821-1832)', () => {
  it('renders seconds, minutes and hours forms', () => {
    expect(formatJobDuration({ created_ts: 100, updated_ts: 105 })).toBe('5s');
    expect(formatJobDuration({ created_ts: 100, updated_ts: 165 })).toBe('1m 05s');
    expect(formatJobDuration({ created_ts: 0, updated_ts: 165 })).toBe('');
    expect(formatJobDuration({ created_ts: 200, updated_ts: 100 })).toBe('');
    expect(formatJobDuration({ created_ts: 0, updated_ts: 3600 + 120 })).toBe(''); // created 0 → unknown
    expect(formatJobDuration({ created_ts: 10, updated_ts: 3600 + 120 + 10 })).toBe('1h 02m');
  });
});

describe('buildDateValueToMs (:1288-1299)', () => {
  it('parses yyyy-mm-dd, the now special value, and rejects junk', () => {
    expect(buildDateValueToMs('')).toBeNull();
    expect(buildDateValueToMs('2024-13-99')).toBeNull();
    expect(buildDateValueToMs('now')!).toBeGreaterThan(0);
    expect(buildDateValueToMs('2024-01-02')!).toBe(new Date('2024-01-02T00:00:00').getTime());
  });
});
