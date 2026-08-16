import { describe, expect, it } from 'vitest';
import {
  formatInventoryTableValue,
  getInventoryCoinDisplayName,
  getInventoryCoinDisplayNames,
  getInventoryTableColumns,
} from './inventoryColumns';

/* M-data-6 — legacy getInventoryCoinDisplayName(s) :6248-6266,
   getInventoryTableColumns :7868-7892, formatInventoryTableValue :7894-7910. */

const t = (key: string): string => key;

describe('getInventoryCoinDisplayName (:6248-6260)', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(getInventoryCoinDisplayName('')).toBe('');
    expect(getInventoryCoinDisplayName('   ')).toBe('');
    expect(getInventoryCoinDisplayName(null)).toBe('');
  });

  it('strips the XYZ: and XYZ- stock prefixes (:6252-6254)', () => {
    expect(getInventoryCoinDisplayName('XYZ:TSLA')).toBe('TSLA');
    expect(getInventoryCoinDisplayName('XYZ-TSLA')).toBe('TSLA');
  });

  it('cuts at the first underscore and colon separator (:6255-6258)', () => {
    expect(getInventoryCoinDisplayName('BTC_USDT')).toBe('BTC');
    expect(getInventoryCoinDisplayName('BTC:SPOT')).toBe('BTC');
    expect(getInventoryCoinDisplayName('XYZ:AAPL_US')).toBe('AAPL');
  });

  it('returns the trimmed value when no separator applies (:6259)', () => {
    expect(getInventoryCoinDisplayName(' btc ')).toBe('btc');
  });
});

describe('getInventoryCoinDisplayNames (:6262-6266)', () => {
  it('maps and drops empty entries', () => {
    expect(getInventoryCoinDisplayNames(['XYZ:TSLA', '', 'BTC_USDT'])).toEqual(['TSLA', 'BTC']);
  });

  it('returns an empty array for null input', () => {
    expect(getInventoryCoinDisplayNames(null)).toEqual([]);
  });
});

describe('getInventoryTableColumns (:7868-7892)', () => {
  it('renders the base column order for a non-hyperliquid 1m view', () => {
    expect(getInventoryTableColumns('1m', 'bybit', t).map((c) => c.key)).toEqual([
      'coin',
      'n_files',
      'size',
      'oldest_day',
      'newest_day',
      'n_days',
      'expected_hours',
      'coverage_pct',
      'missing_days_count',
      'missing_days_sample',
      // 1m-only tail (:7884-7890) — but the minutes columns are blank on
      // non-hyperliquid, see formatInventoryTableValue below
      'hl_minutes',
      'other_minutes',
      'missing_minutes',
    ]);
  });

  it('inserts mapping_status after coin for hyperliquid (:7883)', () => {
    const columns = getInventoryTableColumns('1m', 'hyperliquid', t).map((c) => c.key);
    expect(columns[0]).toBe('coin');
    expect(columns[1]).toBe('mapping_status');
    expect(columns).toContain('hl_minutes');
  });

  it('prepends timeframe and shifts mapping_status for pb7_cache on hyperliquid (:7870, :7883)', () => {
    const columns = getInventoryTableColumns('pb7_cache', 'hyperliquid', t).map((c) => c.key);
    expect(columns.slice(0, 4)).toEqual(['timeframe', 'coin', 'mapping_status', 'n_files']);
    expect(columns).not.toContain('hl_minutes');
  });

  it('omits mapping_status for pb7_cache on a non-hyperliquid exchange', () => {
    const columns = getInventoryTableColumns('pb7_cache', 'okx', t).map((c) => c.key);
    expect(columns[0]).toBe('timeframe');
    expect(columns).not.toContain('mapping_status');
  });

  it('labels columns through the injected translate fn', () => {
    expect(getInventoryTableColumns('1m', 'bybit', t)[0]).toEqual({
      key: 'coin',
      label: 'market.coin',
    });
    expect(getInventoryTableColumns('pb7_cache', 'bybit', t)[0]).toEqual({
      key: 'timeframe',
      label: 'market.timeframe',
    });
  });
});

describe('formatInventoryTableValue (:7894-7910)', () => {
  it('renders the coin display name (:7895)', () => {
    expect(formatInventoryTableValue('1m', 'coin', { coin: 'XYZ:TSLA' }, 'hyperliquid')).toBe('TSLA');
  });

  describe('mapping_status (:7896-7899)', () => {
    it('is blank on non-hyperliquid or non-xyz rows', () => {
      expect(formatInventoryTableValue('1m', 'mapping_status', { coin: 'BTC', is_xyz: false }, 'bybit')).toBe('');
      expect(
        formatInventoryTableValue('1m', 'mapping_status', { coin: 'BTC', is_xyz: false }, 'hyperliquid')
      ).toBe('');
    });

    it('defaults to "missing" and replaces underscores (:7898)', () => {
      expect(formatInventoryTableValue('1m', 'mapping_status', { is_xyz: true }, 'hyperliquid')).toBe('missing');
      expect(
        formatInventoryTableValue('1m', 'mapping_status', { is_xyz: true, mapping_status: 'auto_mapped' }, 'hyperliquid')
      ).toBe('auto mapped');
    });
  });

  it('formats size in MB with two decimals (:7900)', () => {
    expect(formatInventoryTableValue('1m', 'size', { size: 12 }, 'bybit')).toBe('12.00 MB');
    expect(formatInventoryTableValue('1m', 'size', { size: 0 }, 'bybit')).toBe('0.00 MB');
    expect(formatInventoryTableValue('1m', 'size', {}, 'bybit')).toBe('0.00 MB');
  });

  it('formats coverage with two decimals or blank when not finite (:7901-7904)', () => {
    expect(formatInventoryTableValue('1m', 'coverage_pct', { coverage_pct: 12.3456 }, 'bybit')).toBe('12.35');
    expect(formatInventoryTableValue('1m', 'coverage_pct', { coverage_pct: 'abc' }, 'bybit')).toBe('');
    expect(formatInventoryTableValue('1m', 'coverage_pct', {}, 'bybit')).toBe('');
  });

  it('blanks the minute columns on non-hyperliquid (:7905-7907)', () => {
    expect(formatInventoryTableValue('1m', 'hl_minutes', { hl_minutes: 10 }, 'bybit')).toBe('');
    expect(formatInventoryTableValue('1m', 'other_minutes', { other_minutes: 3 }, 'okx')).toBe('');
    expect(formatInventoryTableValue('1m', 'missing_minutes', { missing_minutes: 1 }, 'binance')).toBe('');
  });

  it('stringifies other values and blanks null (:7908-7909)', () => {
    expect(formatInventoryTableValue('1m', 'n_files', { n_files: 42 }, 'bybit')).toBe('42');
    expect(formatInventoryTableValue('1m', 'oldest_day', { oldest_day: null }, 'bybit')).toBe('');
    expect(formatInventoryTableValue('1m', 'oldest_day', { oldest_day: '2024-01-02' }, 'bybit')).toBe('2024-01-02');
  });
});
