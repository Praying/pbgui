import { describe, expect, it } from 'vitest';
import {
  formatDurationCompact,
  formatTradfiPrice,
  formatTradfiTimestamp,
  formatUsageBytes,
} from './tradfiFormat';

/* TradFi formatting helpers — legacy formatBytes (:5643-5653, the usage-panel
   variant — NOT fmtBytes :4957), formatTradfiPrice (:5655-5658),
   formatTradfiTimestamp (:5660-5664) and formatDurationCompact (:5666-5674). */

describe('formatUsageBytes (:5643-5653)', () => {
  it('returns "0 B" for null/undefined/zero/negative/non-finite input', () => {
    expect(formatUsageBytes(null)).toBe('0 B');
    expect(formatUsageBytes(undefined)).toBe('0 B');
    expect(formatUsageBytes(0)).toBe('0 B');
    expect(formatUsageBytes(-5)).toBe('0 B');
    expect(formatUsageBytes('abc')).toBe('0 B');
    expect(formatUsageBytes(Number.NaN)).toBe('0 B');
  });

  it('formats whole bytes without decimals (:5652 toFixed(0) at index 0)', () => {
    expect(formatUsageBytes(512)).toBe('512 B');
    expect(formatUsageBytes(1000)).toBe('1000 B');
    expect(formatUsageBytes(1023)).toBe('1023 B');
  });

  it('uses one decimal below ten of a unit and none at/above it (:5652)', () => {
    expect(formatUsageBytes(1024)).toBe('1.0 KB');
    expect(formatUsageBytes(1536)).toBe('1.5 KB');
    expect(formatUsageBytes(9 * 1024)).toBe('9.0 KB'); // exactly 9 → toFixed(1)
    expect(formatUsageBytes(10 * 1024)).toBe('10 KB');
    expect(formatUsageBytes(1048576)).toBe('1.0 MB');
    expect(formatUsageBytes(1073741824)).toBe('1.0 GB');
  });

  it('caps at the TB unit (:5650 loop bound)', () => {
    expect(formatUsageBytes(1024 ** 4)).toBe('1.0 TB');
    expect(formatUsageBytes(1024 ** 5)).toBe('1024 TB'); // index saturates
  });

  it('coerces numeric strings like legacy Number()', () => {
    expect(formatUsageBytes('2048')).toBe('2.0 KB');
  });
});

describe('formatTradfiPrice (:5655-5658)', () => {
  it('formats finite values with four decimals', () => {
    expect(formatTradfiPrice(123.456789)).toBe('123.4568');
    expect(formatTradfiPrice(0)).toBe('0.0000');
    expect(formatTradfiPrice('12.5')).toBe('12.5000');
    expect(formatTradfiPrice(1)).toBe('1.0000');
  });

  it('returns "-" only for non-finite coercions — Number(null/\'\') is 0 (:5656-5657)', () => {
    expect(formatTradfiPrice(undefined)).toBe('-');
    expect(formatTradfiPrice('n/a')).toBe('-');
    expect(formatTradfiPrice(null)).toBe('0.0000'); // Number(null) === 0
    expect(formatTradfiPrice('')).toBe('0.0000'); // Number('') === 0
  });
});

describe('formatTradfiTimestamp (:5660-5664)', () => {
  it('replaces the T and truncates ISO timestamps to 19 chars', () => {
    expect(formatTradfiTimestamp('2026-08-16T10:20:30Z')).toBe('2026-08-16 10:20:30');
    expect(formatTradfiTimestamp('2026-08-16T10:20:30')).toBe('2026-08-16 10:20:30');
  });

  it('passes shorter strings through untouched', () => {
    expect(formatTradfiTimestamp('2026-08-16')).toBe('2026-08-16');
    expect(formatTradfiTimestamp('2026-08-16 10:20')).toBe('2026-08-16 10:20');
  });

  it('returns "" for empty/blank/null input (:5661 trim)', () => {
    expect(formatTradfiTimestamp('')).toBe('');
    expect(formatTradfiTimestamp('   ')).toBe('');
    expect(formatTradfiTimestamp(null)).toBe('');
    expect(formatTradfiTimestamp(undefined)).toBe('');
  });
});

describe('formatDurationCompact (:5666-5674)', () => {
  it('formats seconds-only durations', () => {
    expect(formatDurationCompact(0)).toBe('0s');
    expect(formatDurationCompact(59)).toBe('59s');
    expect(formatDurationCompact(1)).toBe('1s');
  });

  it('formats minutes with seconds', () => {
    expect(formatDurationCompact(60)).toBe('1m 0s');
    expect(formatDurationCompact(90.7)).toBe('1m 30s'); // floored seconds
    expect(formatDurationCompact(3599)).toBe('59m 59s');
  });

  it('formats hours with minutes once hours exist (:5671)', () => {
    expect(formatDurationCompact(3600)).toBe('1h 0m');
    expect(formatDurationCompact(90061)).toBe('25h 1m');
  });

  it('clamps negative and non-numeric input to 0s (:5667)', () => {
    expect(formatDurationCompact(-5)).toBe('0s');
    expect(formatDurationCompact('abc')).toBe('0s');
    expect(formatDurationCompact(null)).toBe('0s');
    expect(formatDurationCompact(undefined)).toBe('0s');
  });
});
