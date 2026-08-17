import { describe, expect, it } from 'vitest';
import {
  buildExposure,
  drawdownSeries,
  filterResults,
  hardStopEma,
  hardStopLookbackDays,
  hardStopSideConfig,
  hardStopTriggerIndices,
  normalizeBe,
  parseIsoMillis,
  resultConfigNames,
  resultDisplayName,
  resultPriceMarkets,
  resultsForVersion,
  resolveFillsTimes,
  rollingDrawdown,
  sortResults,
} from './resultsModel';
import type { BacktestResultItem, ParsedCsv } from '../types';

/*
 * The results view's pure model — the port of v7_backtest.html's results
 * filtering/sorting (:5342-5610), the BE CSV normalizer (:6920-6966), the
 * fills timestamp resolver (:7289-7335), the TWE exposure pivot
 * (:7413-7482), the equity hard-stop math (:7044-7125) and the compare
 * path resolver inputs (:7596-7599).
 */

function item(partial: Partial<BacktestResultItem> & { path: string }): BacktestResultItem {
  return {
    config_name: 'cfg',
    result_name: 'res',
    backtest_version: 'v7',
    ...partial,
  };
}

describe('version filter (:5342-5347, :10010)', () => {
  const items = [
    item({ path: 'a', backtest_version: 'v7' }),
    item({ path: 'b', backtest_version: 'v8' }),
  ];
  it("'both' keeps everything", () => {
    expect(resultsForVersion(items, 'both')).toHaveLength(2);
  });
  it('keeps only the selected version', () => {
    expect(resultsForVersion(items, 'v7').map((r) => r.path)).toEqual(['a']);
    expect(resultsForVersion(items, 'v8').map((r) => r.path)).toEqual(['b']);
  });
});

describe('config + text filter (:5588-5595)', () => {
  const items = [
    item({ path: 'a', config_name: 'alpha', result_name: 'r1' }),
    item({ path: 'b', config_name: 'beta', result_name: 'r2' }),
    item({ path: 'c', config_name: 'alpha', result_name: 'Zed' }),
  ];
  it('filters by exact config name', () => {
    expect(filterResults(items, 'alpha', '').map((r) => r.path)).toEqual(['a', 'c']);
  });
  it('matches the lowercase config+result haystack', () => {
    expect(filterResults(items, '', 'zed').map((r) => r.path)).toEqual(['c']);
    expect(filterResults(items, '', 'ETA R').map((r) => r.path)).toEqual(['b']);
  });
  it('combines both filters', () => {
    expect(filterResults(items, 'alpha', 'r1').map((r) => r.path)).toEqual(['a']);
  });
  it('empty needle keeps all', () => {
    expect(filterResults(items, '', '')).toHaveLength(3);
  });
});

describe('sort (:5599-5610)', () => {
  const items = [
    item({ path: 'a', config_name: 'beta', adg: 0.2, modified: '2024-01-03T00:00:00Z' }),
    item({ path: 'b', config_name: 'Alpha', adg: 0.1, modified: '2024-01-02T00:00:00Z' }),
    item({ path: 'c', config_name: undefined, adg: undefined, modified: undefined } as unknown as BacktestResultItem),
  ];
  it('sorts strings case-insensitively', () => {
    expect(sortResults(items, { col: 'config_name', asc: true }).map((r) => r.path)).toEqual(['c', 'b', 'a']);
  });
  it('sorts numbers and treats undefined as empty string (legacy quirk)', () => {
    // undefined → '' coerces BELOW every number ('' → 0 < 0.1): descending
    // puts numbers first and the undefined row last
    expect(sortResults(items, { col: 'adg', asc: false }).map((r) => r.path)).toEqual(['a', 'b', 'c']);
    expect(sortResults(items, { col: 'adg', asc: true }).map((r) => r.path)).toEqual(['c', 'b', 'a']);
  });
  it('does not mutate the input array', () => {
    const order = items.map((r) => r.path);
    sortResults(items, { col: 'modified', asc: false });
    expect(items.map((r) => r.path)).toEqual(order);
  });
});

describe('resultConfigNames (:5363-5365)', () => {
  it('collects the unique sorted config names of the version-filtered rows', () => {
    const items = [
      item({ path: 'a', config_name: 'zeta' }),
      item({ path: 'b', config_name: 'alpha' }),
      item({ path: 'c', config_name: 'zeta' }),
      item({ path: 'd', config_name: '' }),
    ];
    expect(resultConfigNames(items)).toEqual(['alpha', 'zeta']);
  });
});

describe('resultDisplayName (:5543)', () => {
  it('prefers display_name', () => {
    expect(resultDisplayName(item({ path: 'a', display_name: 'shown', config_name: 'c', result_name: 'r' }))).toBe('shown');
  });
  it('falls back to config/exchange_dir/result', () => {
    expect(resultDisplayName(item({ path: 'a', config_name: 'c', exchange_dir: 'binance', result_name: 'r' }))).toBe('c/binance/r');
  });
});

describe('resultPriceMarkets (:6550-6570)', () => {
  it('crosses exchanges × coins, dropping combined/all/dupes', () => {
    const markets = resultPriceMarkets(
      item({ path: 'a', exchanges: ['binance', 'binance', ''], coins: ['BTC', 'ETH', 'all', ''] })
    );
    expect(markets).toEqual([
      { exchange: 'binance', coin: 'BTC' },
      { exchange: 'binance', coin: 'ETH' },
    ]);
  });
  it('exchange_dir overrides the exchanges array unless combined/suite_runs', () => {
    expect(resultPriceMarkets(item({ path: 'a', exchange_dir: 'bybit', exchanges: ['binance'], coins: ['BTC'] }))).toEqual([
      { exchange: 'bybit', coin: 'BTC' },
    ]);
    expect(resultPriceMarkets(item({ path: 'a', exchange_dir: 'combined', exchanges: ['binance'], coins: ['BTC'] }))).toEqual([
      { exchange: 'binance', coin: 'BTC' },
    ]);
  });
  it('splits coins_text when coins is missing', () => {
    expect(resultPriceMarkets(item({ path: 'a', exchange_dir: 'bybit', coins_text: 'BTC, ETH' }))).toEqual([
      { exchange: 'bybit', coin: 'BTC' },
      { exchange: 'bybit', coin: 'ETH' },
    ]);
  });
});

describe('normalizeBe (:6920-6966)', () => {
  it('new format: datetime index + usd_/btc_ columns', () => {
    const csv: ParsedCsv = {
      headers: ['', 'usd_total_balance', 'usd_total_equity', 'btc_total_balance', 'btc_total_equity'],
      rows: [
        { '': '2024-01-01T00:00:00Z', usd_total_balance: '100', usd_total_equity: '101', btc_total_balance: '0.002', btc_total_equity: '0.0021' },
        { '': '2024-01-02T00:00:00Z', usd_total_balance: '102', usd_total_equity: '103', btc_total_balance: '0.0022', btc_total_equity: '0.0023' },
      ],
    };
    const be = normalizeBe(csv, item({ path: 'a' }));
    expect(be.time).toEqual(['2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z']);
    expect(be.balance).toEqual([100, 102]);
    expect(be.equity).toEqual([101, 103]);
    expect(be.balance_btc).toEqual([0.002, 0.0022]);
    expect(be.equity_btc).toEqual([0.0021, 0.0023]);
  });

  it('old format: minute index counted back from end_date', () => {
    const csv: ParsedCsv = {
      headers: ['', 'balance', 'equity', 'balance_btc', 'equity_btc'],
      rows: [
        { '': '0', balance: '100', equity: '100', balance_btc: '0', equity_btc: '0' },
        { '': '1440', balance: '200', equity: '210', balance_btc: '0', equity_btc: '0' },
      ],
    };
    const be = normalizeBe(csv, item({ path: 'a', end_date: '2024-01-02T00:00:00Z' }));
    expect(be.time).toEqual(['2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z']);
    expect(be.balance).toEqual([100, 200]);
    expect(be.equity).toEqual([100, 210]);
  });

  it('fallback: datetime index with either column naming', () => {
    const csv: ParsedCsv = {
      headers: ['', 'balance', 'equity'],
      rows: [{ '': '2024-01-01T00:00:00Z', balance: '5', equity: '6' }],
    };
    const be = normalizeBe(csv, item({ path: 'a' }));
    expect(be.balance).toEqual([5]);
    expect(be.equity).toEqual([6]);
    expect(be.balance_btc).toEqual([0]);
  });

  it('empty rows return empty series', () => {
    expect(normalizeBe({ headers: [], rows: [] }, item({ path: 'a' })).time).toEqual([]);
  });
});

describe('resolveFillsTimes (:7289-7335)', () => {
  it('prefers an explicit time column verbatim', () => {
    const rows = [{ time: '2024-01-01 00:00:00' }, { time: '2024-01-02 00:00:00' }];
    expect(resolveFillsTimes(rows, ['time', 'coin'], item({ path: 'a' }))).toEqual(['2024-01-01 00:00:00', '2024-01-02 00:00:00']);
  });

  it('numeric timestamp column: ms passes through, seconds are scaled', () => {
    const rows = [{ timestamp: '1704067200000' }, { timestamp: '1' }];
    const times = resolveFillsTimes(rows, ['timestamp'], item({ path: 'a' })) as string[];
    expect(times[0]).toBe('2024-01-01T00:00:00.000Z');
    expect(times[1]).toBe('1970-01-01T00:00:01.000Z');
  });

  it('string timestamp column is normalized to UTC ISO', () => {
    const rows = [{ timestamp: '2020-01-05 21:33:00' }];
    expect(resolveFillsTimes(rows, ['timestamp'], item({ path: 'a' }))).toEqual(['2020-01-05T21:33:00.000Z']);
  });

  it('legacy minute column offsets back from end_date by the max minute', () => {
    const rows = [{ minute: '0' }, { minute: '120' }];
    const times = resolveFillsTimes(rows, ['minute'], item({ path: 'a', end_date: '2024-01-02T02:00:00Z' })) as string[];
    expect(times).toEqual(['2024-01-02T00:00:00.000Z', '2024-01-02T02:00:00.000Z']);
  });

  it('falls back to row indices', () => {
    const rows = [{ coin: 'BTC' }, { coin: 'ETH' }];
    expect(resolveFillsTimes(rows, ['coin'], item({ path: 'a' }))).toEqual([0, 1]);
  });
});

describe('buildExposure (:7413-7482)', () => {
  it('forward-fills per-coin WE, sums TWE and resamples by max per bucket', () => {
    const fills = [
      { time: '2024-01-01T00:00:00Z', coin: 'BTC', we: 0.5 },
      { time: '2024-01-01T06:00:00Z', coin: 'ETH', we: 0.2 },
      { time: '2024-01-02T00:00:00Z', coin: 'BTC', we: 0.1 },
    ];
    const series = buildExposure(fills, 1440);
    // daily buckets: day1 max twe 0.7, day2 0.3 (float accumulation like legacy)
    expect(series.times).toEqual(['2024-01-01T00:00:00.000Z', '2024-01-02T00:00:00.000Z']);
    expect(series.twe[0]).toBeCloseTo(0.7);
    expect(series.twe[1]).toBeCloseTo(0.3);
    expect(series.coins.BTC![0]).toBeCloseTo(0.5);
    expect(series.coins.BTC![1]).toBeCloseTo(0.1);
    expect(series.coins.ETH![0]).toBeCloseTo(0.2);
    expect(series.coins.ETH![1]).toBeCloseTo(0.2);
  });

  it('fills the complete grid between first and last bucket, forward-filling gaps', () => {
    const fills = [
      { time: '2024-01-02T12:00:00Z', coin: 'BTC', we: 1 },
      { time: '2024-01-04T00:00:00Z', coin: 'BTC', we: 0.5 },
    ];
    const series = buildExposure(fills, 1440);
    // Jan3 has no fill: the Jan2 bucket entry carries forward (ffill)
    expect(series.times).toEqual(['2024-01-02T00:00:00.000Z', '2024-01-03T00:00:00.000Z', '2024-01-04T00:00:00.000Z']);
    expect(series.twe).toEqual([1, 1, 0.5]);
  });

  it('returns empty series for no fills', () => {
    expect(buildExposure([], 60)).toEqual({ times: [], twe: [], coins: {} });
  });
});

describe('hard-stop math (:7044-7125)', () => {
  const v8Config = {
    bot: {
      long: {
        risk: { total_wallet_exposure_limit: 1, n_positions: 3 },
        hsl: { enabled: true, red_threshold: 0.2, ema_span_minutes: 60, tier_ratios: { yellow: 0.5, orange: 0.75 } },
      },
    },
  };

  it('v8 hardStopSideConfig resolves risk + hsl paths and thresholds', () => {
    const cfg = hardStopSideConfig('v8', v8Config, 'long');
    expect(cfg).toEqual({
      side: 'long',
      redThreshold: 0.2,
      emaSpan: 60,
      yellowThreshold: 0.5 * 0.2, // legacy multiplies the ratio by redThreshold
      orangeThreshold: 0.75 * 0.2,
    });
  });

  it('returns null when the hard stop is disabled or incomplete', () => {
    const disabled = { bot: { long: { risk: { total_wallet_exposure_limit: 1, n_positions: 3 }, hsl: { enabled: false, red_threshold: 0.2, ema_span_minutes: 60 } } } };
    expect(hardStopSideConfig('v8', disabled, 'long')).toBeNull();
    expect(hardStopSideConfig('v8', { bot: {} }, 'long')).toBeNull();
    expect(hardStopSideConfig('v8', v8Config, 'short')).toBeNull();
  });

  it('v7 reads the flat side root + hsl_ prefix', () => {
    const v7Config = {
      bot: { short: { total_wallet_exposure_limit: 2, n_positions: 1, hsl_enabled: true, hsl_red_threshold: 0.3, hsl_ema_span_minutes: 30 } },
    };
    expect(hardStopSideConfig('v7', v7Config, 'short')).toMatchObject({ side: 'short', redThreshold: 0.3, emaSpan: 30 });
  });

  it('lookback days: default 30, "all" → null, positive numbers pass', () => {
    expect(hardStopLookbackDays({ live: {} })).toBe(30);
    expect(hardStopLookbackDays({ live: { pnls_max_lookback_days: 'all' } })).toBeNull();
    expect(hardStopLookbackDays({ live: { pnls_max_lookback_days: 7 } })).toBe(7);
    expect(hardStopLookbackDays({ live: { pnls_max_lookback_days: -1 } })).toBe(30);
  });

  it('rollingDrawdown tracks the running peak with an optional lookback (days)', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(rollingDrawdown([0, day, 2 * day], [100, 200, 100], null)).toEqual([0, 0, 0.5]);
    // 1-day lookback, last point 2 days out: the peak fell out of the
    // window (prune is ts < ts-lookback, so exactly-at-edge is kept)
    expect(rollingDrawdown([0, day, 3 * day], [100, 200, 100], 1)).toEqual([0, 0, 0]);
    expect(rollingDrawdown([0, day, 3 * day], [100, 200, 100], 3)).toEqual([0, 0, 0.5]);
    // non-finite points score 0 instead of crashing
    expect(rollingDrawdown([0, Number.NaN], [100, 100], null)).toEqual([0, 0]);
  });

  it('hardStopEma decays toward the raw value over elapsed minutes', () => {
    const times = [0, 60_000, 120_000];
    const raw = [0, 0.4, 0.4];
    const ema = hardStopEma(times, raw, 1); // alpha = 1 → instant
    expect(ema).toEqual([0, 0.4, 0.4]);
    const slow = hardStopEma(times, raw, 61); // alpha ≈ 0.032
    expect(slow[2]).toBeLessThan(0.4);
    expect(slow[1]).toBeGreaterThan(0);
  });

  it('trigger indices record only rising edges across the red threshold', () => {
    expect(hardStopTriggerIndices([0, 0.3, 0.3, 0.1, 0.25], 0.2)).toEqual([1, 4]);
  });
});

describe('drawdownSeries (:6981-6990)', () => {
  it('normalizes equity to a 1 → 0 drawdown curve', () => {
    expect(drawdownSeries([100, 200, 100, 400])).toEqual([1, 1, 0.5, 1]);
    expect(drawdownSeries([])).toEqual([]);
  });
});

describe('parseIsoMillis (:7596-7599)', () => {
  it('parses ISO strings and yields NaN for junk', () => {
    expect(parseIsoMillis('2024-01-01T00:00:00Z')).toBe(Date.parse('2024-01-01T00:00:00Z'));
    expect(Number.isNaN(parseIsoMillis(''))).toBe(true);
    expect(Number.isNaN(parseIsoMillis(undefined))).toBe(true);
  });
});
