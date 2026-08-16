import { describe, expect, it } from 'vitest';
import {
  filterInventoryRows,
  getInventorySortValue,
  sortInventoryRows,
} from './inventorySort';

/* M-data-6 — legacy getInventoryFilteredRows :7832-7849,
   getInventorySortValue :7912-7932, sortInventoryRows :7934-7965. */

describe('filterInventoryRows (:7832-7849)', () => {
  const rows = [
    { coin: 'BTC', timeframe: '1m', is_xyz: false, mapping_status: '' },
    { coin: 'ETH', timeframe: '1h', is_xyz: false, mapping_status: '' },
    { coin: 'xyz:tsla', timeframe: '1m', is_xyz: true, mapping_status: 'mapped' },
    { coin: 'XYZ-AAPL', timeframe: '1m', is_xyz: true, mapping_status: 'missing' },
    { coin: 'SOL', timeframe: '', is_xyz: false, mapping_status: '' },
  ];

  it('matches the coin filter case-insensitively as a substring (:7841)', () => {
    const out = filterInventoryRows(rows, { coinFilter: 'btc', kindFilter: 'all', timeframeFilter: 'all' });
    expect(out).toHaveLength(1);
    expect(out[0]?.coin).toBe('BTC');
  });

  it('keeps everything for a blank coin filter', () => {
    expect(filterInventoryRows(rows, { coinFilter: '  ', kindFilter: 'all', timeframeFilter: 'all' })).toHaveLength(5);
  });

  it('stocks (xyz) / xyz only keeps stock rows (:7839, :7842)', () => {
    for (const kindFilter of ['stocks (xyz)', 'xyz only'] as const) {
      const out = filterInventoryRows(rows, { coinFilter: '', kindFilter, timeframeFilter: 'all' });
      expect(out.map((r) => r.coin).sort()).toEqual(['XYZ-AAPL', 'xyz:tsla']);
    }
  });

  it('xyz mapped keeps only mapped stocks (:7843)', () => {
    const out = filterInventoryRows(rows, { coinFilter: '', kindFilter: 'xyz mapped', timeframeFilter: 'all' });
    expect(out).toHaveLength(1);
    expect(out[0]?.coin).toBe('xyz:tsla');
  });

  it('xyz not mapped keeps only unmapped stocks (:7844)', () => {
    const out = filterInventoryRows(rows, { coinFilter: '', kindFilter: 'xyz not mapped', timeframeFilter: 'all' });
    expect(out).toHaveLength(1);
    expect(out[0]?.coin).toBe('XYZ-AAPL');
  });

  it('crypto excludes stocks (:7845)', () => {
    const out = filterInventoryRows(rows, { coinFilter: '', kindFilter: 'crypto', timeframeFilter: 'all' });
    expect(out.map((r) => r.coin)).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('timeframe filter matches case-insensitively (:7846)', () => {
    const out = filterInventoryRows(rows, { coinFilter: '', kindFilter: 'all', timeframeFilter: '1H' });
    expect(out).toHaveLength(1);
    expect(out[0]?.coin).toBe('ETH');
  });

  it('treats a stock named with the XYZ: prefix as a stock even without is_xyz (:7839)', () => {
    const out = filterInventoryRows([{ coin: 'XYZ:MSFT', timeframe: '' }], {
      coinFilter: '',
      kindFilter: 'stocks (xyz)',
      timeframeFilter: 'all',
    });
    expect(out).toHaveLength(1);
  });

  it('returns an empty array for empty rows', () => {
    expect(filterInventoryRows([], { coinFilter: '', kindFilter: 'all', timeframeFilter: 'all' })).toEqual([]);
  });
});

describe('getInventorySortValue (:7912-7932)', () => {
  it('prefers total_bytes over size for the size column (:7913)', () => {
    expect(getInventorySortValue({ size: 1, total_bytes: 500 }, 'size')).toBe(500);
    expect(getInventorySortValue({ size: 2 }, 'size')).toBe(2);
    expect(getInventorySortValue({}, 'size')).toBe(0);
  });

  it('coerces the numeric columns through Number(x || 0) (:7914-7924)', () => {
    expect(getInventorySortValue({ n_files: '7' }, 'n_files')).toBe(7);
    expect(getInventorySortValue({ coverage_pct: null }, 'coverage_pct')).toBe(0);
    expect(getInventorySortValue({ missing_minutes: undefined }, 'missing_minutes')).toBe(0);
  });

  it('keeps day columns as strings (:7926-7928)', () => {
    expect(getInventorySortValue({ oldest_day: '2024-01-02' }, 'oldest_day')).toBe('2024-01-02');
    expect(getInventorySortValue({}, 'newest_day')).toBe('');
  });

  it('uppercases other strings and passes numbers through (:7929-7931)', () => {
    expect(getInventorySortValue({ coin: 'btc' }, 'coin')).toBe('BTC');
    expect(getInventorySortValue({ some_number: 4 }, 'some_number')).toBe(4);
    expect(getInventorySortValue({ missing_days_sample: null }, 'missing_days_sample')).toBe('');
  });
});

describe('sortInventoryRows (:7934-7965)', () => {
  const rows = [
    { row_id: 'a', coin: 'ETH', n_files: 5, size: 1 },
    { row_id: 'b', coin: 'btc', n_files: 2, size: 3 },
    { row_id: 'c', coin: 'ADA', n_files: 9, size: 2 },
  ];

  it('sorts numerically ascending and descending (:7941-7943, :7963)', () => {
    expect(sortInventoryRows(rows, 'n_files', 'asc').map((r) => r.row_id)).toEqual(['b', 'a', 'c']);
    expect(sortInventoryRows(rows, 'n_files', 'desc').map((r) => r.row_id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts strings with numeric locale compare (:7945-7948)', () => {
    const dayRows = [
      { row_id: 'x', coin: 'A', oldest_day: '2024-02-01' },
      { row_id: 'y', coin: 'B', oldest_day: '2024-10-01' },
      { row_id: 'z', coin: 'C', oldest_day: '2024-01-01' },
    ];
    expect(sortInventoryRows(dayRows, 'oldest_day', 'asc').map((r) => r.row_id)).toEqual(['z', 'x', 'y']);
  });

  it('breaks ties on coin then row_id (:7951-7962)', () => {
    const tied = [
      { row_id: 'r2', coin: 'BTC', n_files: 1 },
      { row_id: 'r1', coin: 'BTC', n_files: 1 },
      { row_id: 'r0', coin: 'AAA', n_files: 1 },
    ];
    expect(sortInventoryRows(tied, 'n_files', 'asc').map((r) => r.row_id)).toEqual(['r0', 'r1', 'r2']);
  });

  it('treats non-finite numeric results as equal (:7943)', () => {
    // NaN - NaN → NaN → guarded to 0 → tie broken by coin/row_id
    const nanRows = [
      { row_id: 'n2', coin: 'B', n_files: Number.NaN },
      { row_id: 'n1', coin: 'A', n_files: Number.NaN },
    ];
    expect(sortInventoryRows(nanRows, 'n_files', 'asc').map((r) => r.row_id)).toEqual(['n1', 'n2']);
  });

  it('does not mutate the input array (:7936)', () => {
    const input = [...rows];
    sortInventoryRows(rows, 'coin', 'desc');
    expect(rows).toEqual(input);
  });

  it('handles an empty array', () => {
    expect(sortInventoryRows([], 'coin', 'asc')).toEqual([]);
  });
});
