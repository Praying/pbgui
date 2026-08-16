import { describe, expect, it } from 'vitest';
import { fmtBytes } from './format';

/* Legacy fmtBytes verbatim (market_data_main.html:4957-4967). */

describe('fmtBytes (:4957-4967)', () => {
  it('returns "0 B" for zero, negative, and non-finite input', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(-5)).toBe('0 B');
    expect(fmtBytes(Number.NaN)).toBe('0 B');
    expect(fmtBytes(null)).toBe('0 B');
    expect(fmtBytes(undefined)).toBe('0 B');
    expect(fmtBytes('not a number')).toBe('0 B');
  });

  it('formats plain bytes with integer rounding and no decimals', () => {
    expect(fmtBytes(1)).toBe('1 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1023.6)).toBe('1024 B'); // Math.round before unit switch
  });

  it('scales through the legacy unit ladder with two decimals', () => {
    expect(fmtBytes(1024)).toBe('1.00 KB');
    expect(fmtBytes(1536)).toBe('1.50 KB');
    expect(fmtBytes(1024 * 1024)).toBe('1.00 MB');
    expect(fmtBytes(1024 ** 3)).toBe('1.00 GB');
    expect(fmtBytes(1024 ** 4)).toBe('1.00 TB');
  });

  it('stops at TB (index clamps to the last unit)', () => {
    expect(fmtBytes(1024 ** 5)).toBe('1024.00 TB');
    expect(fmtBytes(1024 ** 6)).toBe('1048576.00 TB');
  });

  it('coerces numeric strings like the legacy Number() cast', () => {
    expect(fmtBytes('2048')).toBe('2.00 KB');
    expect(fmtBytes(10 * 1024 * 1024)).toBe('10.00 MB');
  });
});
