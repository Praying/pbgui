import { describe, expect, it } from 'vitest';
import { formatCompact, formatPrice, formatRatio, rowKey } from './format';

/* Verbatim ports of coin_data.html :1683-1710. */

describe('formatCompact (:1683-1692)', () => {
  it('renders dashes for non-numeric input (null coerces to 0 like legacy Number())', () => {
    expect(formatCompact('abc')).toBe('-');
    expect(formatCompact(undefined)).toBe('-');
    expect(formatCompact(null)).toBe('0.00');
  });

  it('uses fixed suffixes per magnitude', () => {
    expect(formatCompact(1.5e12)).toBe('1.50T');
    expect(formatCompact(2e9)).toBe('2.00B');
    expect(formatCompact(3.4e6)).toBe('3.40M');
    expect(formatCompact(1200)).toBe('1.20K');
    expect(formatCompact(42.5)).toBe('42.50');
    expect(formatCompact(150)).toBe('150');
  });

  it('drops decimals at the next magnitude (abs >= 1e13 etc.)', () => {
    expect(formatCompact(15e12)).toBe('15T');
    expect(formatCompact(25e9)).toBe('25B');
  });
});

describe('formatPrice (:1694-1701)', () => {
  it('renders dashes and the zero special case', () => {
    expect(formatPrice(undefined)).toBe('-');
    expect(formatPrice(0)).toBe('$0');
  });

  it('formats large prices via formatCompact', () => {
    expect(formatPrice(1500)).toBe('$1.50K');
  });

  it('trims trailing zeros for unit-scale prices', () => {
    expect(formatPrice(1.5)).toBe('$1.5');
    expect(formatPrice(1.55)).toBe('$1.55');
  });

  it('uses 4 significant digits below 1', () => {
    expect(formatPrice(0.00012345)).toBe('$0.0001234');
  });
});

describe('formatRatio (:1703-1707)', () => {
  it('appends the x suffix with 4 decimals', () => {
    expect(formatRatio(2.5)).toBe('2.5000x');
    expect(formatRatio('abc')).toBe('-');
  });
});

describe('rowKey (:1709-1710)', () => {
  it('prefers ccxt_symbol, then symbol, then coin', () => {
    expect(rowKey({ ccxt_symbol: 'BTC/USDT', symbol: 'BTCUSDT', coin: 'BTC' }, 'main')).toBe('main::BTC/USDT');
    expect(rowKey({ symbol: 'BTCUSDT', coin: 'BTC' }, 'unmatched')).toBe('unmatched::BTCUSDT');
    expect(rowKey({ coin: 'BTC' }, 'hip3')).toBe('hip3::BTC');
  });
});
