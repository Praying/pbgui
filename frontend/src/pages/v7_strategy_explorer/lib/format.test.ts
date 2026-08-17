import { describe, expect, it } from 'vitest';
import {
  cfgDateValueToMs,
  deepEnsure,
  deepGet,
  esc,
  firstConfigCoin,
  firstConfigExchange,
  fmt,
  fmtFixed,
  humanSize,
  parsePlotTime,
} from './format';

/* Pure helpers ported verbatim from v7_strategy_explorer.html. */

describe('esc (:581-585)', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
  });

  it('renders null/undefined as empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('fmt (:586-590)', () => {
  it('returns "-" for non-finite values', () => {
    expect(fmt(NaN)).toBe('-');
    expect(fmt('abc')).toBe('-');
  });

  it('formats numbers with up to 8 fraction digits by default', () => {
    expect(fmt(1234.567891234)).toBe('1,234.56789123');
  });

  it('honours the digit limit', () => {
    expect(fmt(0.5, 2)).toBe('0.5');
  });
});

describe('fmtFixed (:591-595)', () => {
  it('pads to the requested fraction digits (en-US)', () => {
    expect(fmtFixed(1.5, 4)).toBe('1.5000');
  });

  it('returns "-" for non-finite values', () => {
    expect(fmtFixed(NaN, 2)).toBe('-');
  });
});

describe('humanSize (:596-603)', () => {
  it('renders 0 and negatives as "0 B"', () => {
    expect(humanSize(0)).toBe('0 B');
    expect(humanSize(-5)).toBe('0 B');
  });

  it('walks the unit ladder', () => {
    expect(humanSize(512)).toBe('512 B');
    expect(humanSize(2048)).toBe('2.0 KB');
    expect(humanSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('parsePlotTime (:604-610)', () => {
  it('passes numbers and numeric strings through Number()', () => {
    expect(parsePlotTime(42)).toBe(42);
    expect(parsePlotTime('42')).toBe(42);
  });

  it('parses date strings via Date.parse', () => {
    expect(parsePlotTime('2024-01-02T03:04:05Z')).toBe(Date.parse('2024-01-02T03:04:05Z'));
  });

  it('returns NaN for empty input', () => {
    expect(Number.isNaN(parsePlotTime(''))).toBe(true);
    expect(Number.isNaN(parsePlotTime(null))).toBe(true);
  });
});

describe('deepGet / deepEnsure (:1004-1020)', () => {
  it('deepGet walks paths and falls back', () => {
    expect(deepGet({ a: { b: { c: 7 } } }, ['a', 'b', 'c'], 0)).toBe(7);
    expect(deepGet({ a: 1 }, ['a', 'b'], 'fb')).toBe('fb');
    expect(deepGet(null, ['a'], 'fb')).toBe('fb');
  });

  it('deepEnsure creates intermediate objects and returns the leaf holder', () => {
    const obj: Record<string, unknown> = {};
    const leaf = deepEnsure(obj, ['a', 'b']) as Record<string, unknown>;
    leaf.c = 3;
    expect(obj).toEqual({ a: { b: { c: 3 } } });
  });
});

describe('firstConfigExchange / firstConfigCoin (:1021-1033)', () => {
  it('reads the first backtest exchange', () => {
    expect(firstConfigExchange({ backtest: { exchanges: [' binance ', 'okx'] } })).toBe('binance');
    expect(firstConfigExchange({})).toBe('');
  });

  it('reads the first approved coin preferring long then short', () => {
    const long = { live: { approved_coins: { long: ['BTC'], short: ['ETH'] } } };
    const onlyShort = { live: { approved_coins: { short: ['ETH'] } } };
    const array = { live: { approved_coins: ['XRP'] } };
    expect(firstConfigCoin(long)).toBe('BTC');
    expect(firstConfigCoin(onlyShort)).toBe('ETH');
    expect(firstConfigCoin(array)).toBe('XRP');
    expect(firstConfigCoin({})).toBe('');
  });
});

describe('cfgDateValueToMs (:862-873)', () => {
  it('maps "now" to today midnight local time', () => {
    const now = new Date();
    expect(cfgDateValueToMs('now')).toBe(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime());
  });

  it('parses YYYY-MM-DD', () => {
    expect(cfgDateValueToMs('2024-03-05')).toBe(new Date('2024-03-05T00:00:00').getTime());
  });

  it('rejects other shapes with null', () => {
    expect(cfgDateValueToMs('')).toBeNull();
    expect(cfgDateValueToMs('garbage')).toBeNull();
    expect(cfgDateValueToMs('2024-3-5')).toBeNull();
  });
});
