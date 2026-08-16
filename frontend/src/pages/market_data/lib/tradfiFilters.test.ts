import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CANONICAL_TYPES,
  DEFAULT_EDITOR_STATUSES,
  DEFAULT_FILTER_STATUS_VALUES,
  buildTradfiSymbol,
  deriveTradfiOptionLists,
  filterTradfiRows,
  normalizeSelectValue,
  type TradfiRow,
} from './tradfiFilters';

/* TradFi filter/derivation helpers — legacy buildTradfiSymbol (:6433-6439),
   getTradfiFilteredRows (:6468-6485), syncTradfiSelectOptions value keep
   (:6487-6506) and the renderTradfiMap option fallbacks (:6516-6527). */

function row(overrides: Partial<TradfiRow> = {}): TradfiRow {
  return {
    xyz_coin: 'TSLA',
    canonical_type: 'equity_us',
    status: 'ok',
    tiingo_ticker: 'TSLA',
    tiingo_fx_ticker: '',
    tiingo_fx_invert: false,
    ...overrides,
  };
}

describe('buildTradfiSymbol (:6433-6439)', () => {
  it('prefers the equity ticker with the IEX: prefix, trimmed and uppercased', () => {
    expect(buildTradfiSymbol({ tiingo_ticker: '  tsla ' })).toBe('IEX:TSLA');
    expect(buildTradfiSymbol({ tiingo_ticker: 'aapl', tiingo_fx_ticker: 'XAUUSD' })).toBe('IEX:AAPL');
  });

  it('falls back to the FX ticker with the FX: prefix and (inv) suffix (:6438)', () => {
    expect(buildTradfiSymbol({ tiingo_fx_ticker: ' xauusd ' })).toBe('FX:XAUUSD');
    expect(buildTradfiSymbol({ tiingo_fx_ticker: 'XAUUSD', tiingo_fx_invert: true })).toBe(
      'FX:XAUUSD (inv)'
    );
  });

  it('returns "" when neither ticker is present (:6437)', () => {
    expect(buildTradfiSymbol({})).toBe('');
    expect(buildTradfiSymbol(null)).toBe('');
    expect(buildTradfiSymbol({ tiingo_ticker: '   ', tiingo_fx_ticker: '' })).toBe('');
  });
});

describe('filterTradfiRows (:6468-6485)', () => {
  const rows: TradfiRow[] = [
    row({ xyz_coin: 'TSLA', canonical_type: 'equity_us', status: 'ok' }),
    row({
      xyz_coin: 'XAU',
      canonical_type: 'fx',
      status: 'alias',
      tiingo_ticker: '',
      tiingo_fx_ticker: 'XAUUSD',
    }),
    row({ xyz_coin: 'KRW', canonical_type: 'equity_kr', status: 'pending', tiingo_ticker: '' }),
  ];

  it('returns every row when all filters are neutral', () => {
    expect(filterTradfiRows(rows, { symbol: '', type: 'all', status: 'all' })).toHaveLength(3);
  });

  it('matches the symbol filter case-insensitively across all four haystacks (:6475-6480)', () => {
    expect(filterTradfiRows(rows, { symbol: 'tsla', type: 'all', status: 'all' })).toHaveLength(1);
    expect(filterTradfiRows(rows, { symbol: 'xauusd', type: 'all', status: 'all' })).toHaveLength(1); // FX: composite
    expect(filterTradfiRows(rows, { symbol: 'fx:xau', type: 'all', status: 'all' })).toHaveLength(1); // composite haystack itself
    expect(filterTradfiRows(rows, { symbol: '  xau ', type: 'all', status: 'all' })).toHaveLength(1); // trimmed
    expect(filterTradfiRows(rows, { symbol: 'MISSING', type: 'all', status: 'all' })).toHaveLength(0);
  });

  it('matches type and status filters exactly (:6471-6472)', () => {
    expect(filterTradfiRows(rows, { symbol: '', type: 'fx', status: 'all' })).toHaveLength(1);
    expect(filterTradfiRows(rows, { symbol: '', type: 'all', status: 'pending' })).toHaveLength(1);
    expect(
      filterTradfiRows(rows, { symbol: '', type: 'equity_us', status: 'pending' })
    ).toHaveLength(0);
  });

  it('ANDs the three filters together (:6473)', () => {
    expect(
      filterTradfiRows(rows, { symbol: 'xau', type: 'fx', status: 'alias' })
    ).toHaveLength(1);
  });

  it('treats missing row fields as empty strings', () => {
    expect(filterTradfiRows([{} as TradfiRow], { symbol: 'a', type: 'all', status: 'all' })).toHaveLength(0);
    expect(filterTradfiRows([{} as TradfiRow], { symbol: '', type: 'all', status: 'ok' })).toHaveLength(0);
    expect(filterTradfiRows([{} as TradfiRow], { symbol: '', type: 'all', status: 'all' })).toHaveLength(1);
  });
});

describe('deriveTradfiOptionLists (:6516-6527)', () => {
  const rows: TradfiRow[] = [
    row({ canonical_type: 'fx' }),
    row({ canonical_type: 'equity_us' }),
    row({ canonical_type: 'fx' }),
    row({ canonical_type: '' }),
  ];

  it('uses payload lists verbatim when present', () => {
    const lists = deriveTradfiOptionLists(
      {
        type_values: ['a', 'b'],
        status_values: ['ok'],
        canonical_types: ['equity_us'],
        statuses: ['ok', 'delisted'],
      },
      rows
    );
    expect(lists.typeValues).toEqual(['a', 'b']);
    expect(lists.statusValues).toEqual(['ok']);
    expect(lists.canonicalTypes).toEqual(['equity_us']);
    expect(lists.statuses).toEqual(['ok', 'delisted']);
  });

  it('derives the type list from rows sorted+unique, and defaults the rest (:6518, :6521, :6524, :6527)', () => {
    const lists = deriveTradfiOptionLists(undefined, rows);
    expect(lists.typeValues).toEqual(['equity_us', 'fx']);
    expect(lists.statusValues).toEqual(DEFAULT_FILTER_STATUS_VALUES);
    expect(lists.canonicalTypes).toEqual(DEFAULT_CANONICAL_TYPES);
    expect(lists.statuses).toEqual(DEFAULT_EDITOR_STATUSES);
  });

  it('exposes the legacy default vocabularies (:6521, :6524-6527)', () => {
    expect(DEFAULT_FILTER_STATUS_VALUES).toEqual(['ok', 'alias', 'pending', 'no_provider']);
    expect(DEFAULT_EDITOR_STATUSES).toEqual(['ok', 'alias', 'pending', 'no_provider', 'delisted']);
    expect(DEFAULT_CANONICAL_TYPES).toEqual([
      'equity_us',
      'equity_kr',
      'equity_jp',
      'fx',
      'commodity',
      'commodity_etf',
      'index_etf',
      'etf',
    ]);
  });
});

describe('normalizeSelectValue (:6499-6505)', () => {
  it('keeps the current value while it exists in the list (:6499-6500)', () => {
    expect(normalizeSelectValue(['ok', 'alias'], 'alias', false)).toBe('alias');
    expect(normalizeSelectValue(['ok', 'alias'], 'alias', true)).toBe('alias');
  });

  it('falls back to "all" for include-all selects (:6502)', () => {
    expect(normalizeSelectValue(['ok'], 'gone', true)).toBe('all');
    expect(normalizeSelectValue([], 'ok', true)).toBe('all');
  });

  it('falls back to the first value for single selects (:6503-6504)', () => {
    expect(normalizeSelectValue(['equity_us', 'fx'], 'gone', false)).toBe('equity_us');
  });

  it('keeps the current value when the single-select list is empty (:6503 guard)', () => {
    expect(normalizeSelectValue([], 'equity_us', false)).toBe('equity_us');
  });
});
