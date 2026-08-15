import { describe, expect, it } from 'vitest';
import {
  TIMEFRAMES,
  timeframeLimit,
  timeframeMs,
} from './timeframes';

/*
 * timeframes — the legacy ORDERS timeframe constants (dashboard_editor.html
 * :2025-2034 _tfMs/_tfLimit + dashboard_render.js:3649 TIMEFRAMES). The old
 * code is the spec; every value below mirrors it.
 */

describe('timeframeMs (editor:2025-2030)', () => {
  it('maps every timeframe to its millisecond span', () => {
    expect(timeframeMs('1m')).toBe(60000);
    expect(timeframeMs('5m')).toBe(300000);
    expect(timeframeMs('15m')).toBe(900000);
    expect(timeframeMs('30m')).toBe(1800000);
    expect(timeframeMs('1h')).toBe(3600000);
    expect(timeframeMs('2h')).toBe(7200000);
    expect(timeframeMs('4h')).toBe(14400000);
    expect(timeframeMs('6h')).toBe(21600000);
    expect(timeframeMs('12h')).toBe(43200000);
    expect(timeframeMs('1d')).toBe(86400000);
    expect(timeframeMs('1w')).toBe(604800000);
  });

  it('falls back to 1h for unknown timeframes (legacy map[tf] || 3600000)', () => {
    expect(timeframeMs('9m')).toBe(3600000);
    expect(timeframeMs('')).toBe(3600000);
  });
});

describe('timeframeLimit (editor:2032-2034)', () => {
  it('uses 1500 candles for daily and weekly bars', () => {
    expect(timeframeLimit('1d')).toBe(1500);
    expect(timeframeLimit('1w')).toBe(1500);
  });

  it('uses 500 candles for intraday bars', () => {
    expect(timeframeLimit('4h')).toBe(500);
    expect(timeframeLimit('1m')).toBe(500);
  });
});

describe('TIMEFRAMES (render.js:3649)', () => {
  it('is the 11-button legacy bar order', () => {
    expect(TIMEFRAMES).toEqual([
      '1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w',
    ]);
  });
});
