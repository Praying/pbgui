import { describe, expect, it } from 'vitest';
import { exchangeOptions, getExchangeMeta } from './exchange';

/* Legacy registry verbatim (market_data_main.html:3667-3673) and the
   getExchangeMeta normalizer (:4092-4100). */

describe('exchangeOptions (:3667-3673)', () => {
  it('keeps the five legacy entries in order', () => {
    expect(exchangeOptions.map((o) => o.key)).toEqual([
      'hyperliquid',
      'binance',
      'bybit',
      'bitget',
      'okx',
    ]);
  });

  it('keeps the legacy status keys and labels', () => {
    expect(exchangeOptions).toEqual([
      { key: 'hyperliquid', statusKey: 'hyperliquid', label: 'Hyperliquid' },
      { key: 'binance', statusKey: 'binanceusdm', label: 'Binance USDM' },
      { key: 'bybit', statusKey: 'bybit', label: 'Bybit' },
      { key: 'bitget', statusKey: 'bitget', label: 'Bitget' },
      { key: 'okx', statusKey: 'okx', label: 'OKX' },
    ]);
  });
});

describe('getExchangeMeta (:4092-4100)', () => {
  it('matches by key', () => {
    expect(getExchangeMeta('bybit').key).toBe('bybit');
    expect(getExchangeMeta('  hyperliquid ').key).toBe('hyperliquid'); // trims + lowercases
  });

  it('matches by statusKey', () => {
    expect(getExchangeMeta('binanceusdm').key).toBe('binance');
    expect(getExchangeMeta('okx').statusKey).toBe('okx');
  });

  it('remaps the binance-usdm spelling to binance', () => {
    expect(getExchangeMeta('binance-usdm').key).toBe('binance');
    expect(getExchangeMeta('BinanceUSDM').key).toBe('binance');
  });

  it('falls back to hyperliquid for unknown values', () => {
    expect(getExchangeMeta('kraken').key).toBe('hyperliquid');
  });

  it('falls back to hyperliquid for null/undefined/empty', () => {
    expect(getExchangeMeta(null).key).toBe('hyperliquid');
    expect(getExchangeMeta(undefined).key).toBe('hyperliquid');
    expect(getExchangeMeta('').key).toBe('hyperliquid');
    expect(getExchangeMeta('   ').key).toBe('hyperliquid');
  });

  it('returns the full option shape (key + statusKey + label)', () => {
    expect(getExchangeMeta('bitget')).toEqual({ key: 'bitget', statusKey: 'bitget', label: 'Bitget' });
  });
});
