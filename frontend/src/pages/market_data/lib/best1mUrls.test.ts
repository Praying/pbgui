import { describe, expect, it } from 'vitest';
import {
  BEST1M_JOB_MONITOR_META,
  best1mQueueRoute,
  buildBest1mJobMonitorUrl,
  buildCopyDataJobMonitorUrl,
  buildHyperliquidDataActionsUrl,
  resolveJobMonitorSrc,
} from './best1mUrls';

/* M-data-7 — best-1m + copy-data URL matrices (legacy
   market_data_main.html):
     best1mJobMonitorMeta        :3751-3756
     buildBest1mJobMonitorUrl    :4185-4195
     buildCopyDataJobMonitorUrl  :4215-4222
     mountHyperliquidDataActions :7577-7586
     queueBest1mGeneric routing  :7693-7699 (hyperliquid → iframe path) */

describe('BEST1M_JOB_MONITOR_META (:3751-3756)', () => {
  it('keeps the legacy exchange/job-type CSV table verbatim', () => {
    expect(BEST1M_JOB_MONITOR_META).toEqual({
      binance: { exchange: 'binanceusdm', jobType: 'binance_best_1m' },
      bybit: { exchange: 'bybit', jobType: 'bybit_best_1m' },
      bitget: { exchange: 'bitget', jobType: 'bitget_best_1m,bitget_best_1m_distributed' },
      okx: { exchange: 'okx', jobType: 'okx_best_1m' },
    });
  });
});

describe('best1mQueueRoute — the dual-path matrix (:7693-7699, :3757-3763)', () => {
  it('routes hyperliquid to the embedded data-actions iframe (no form path)', () => {
    expect(best1mQueueRoute('hyperliquid')).toBeNull();
  });

  it('routes the four generic exchanges to their /best-1m/queue path', () => {
    expect(best1mQueueRoute('binance')).toEqual({ api: 'market-data', path: '/best-1m/queue/binance' });
    expect(best1mQueueRoute('bybit')).toEqual({ api: 'market-data', path: '/best-1m/queue/bybit' });
    expect(best1mQueueRoute('bitget')).toEqual({ api: 'market-data', path: '/best-1m/queue/bitget' });
    expect(best1mQueueRoute('okx')).toEqual({ api: 'market-data', path: '/best-1m/queue/okx' });
  });

  it('falls back to the hyperliquid meta for unknown keys (getExchangeMeta)', () => {
    expect(best1mQueueRoute('nonsense')).toBeNull();
  });
});

describe('buildBest1mJobMonitorUrl (:4185-4195)', () => {
  it('embeds serial, embed mode, status exchange and job-type CSV', () => {
    expect(
      buildBest1mJobMonitorUrl({
        exchangeKey: 'bitget',
        serial: 'S9',
        now: () => 1_000,
      })
    ).toBe(
      '/api/jobs/main_page?v=S9&embed=1&exchange=bitget&job_type=bitget_best_1m%2Cbitget_best_1m_distributed'
    );
  });

  it('uses binanceusdm as the monitor exchange for binance', () => {
    expect(
      buildBest1mJobMonitorUrl({ exchangeKey: 'binance', serial: 'S9', now: () => 0 })
    ).toBe('/api/jobs/main_page?v=S9&embed=1&exchange=binanceusdm&job_type=binance_best_1m');
  });

  it('appends the _ts cache-bust only on forceReload', () => {
    expect(
      buildBest1mJobMonitorUrl({ exchangeKey: 'okx', serial: 'S9', forceReload: true, now: () => 42 })
    ).toBe('/api/jobs/main_page?v=S9&embed=1&exchange=okx&job_type=okx_best_1m&_ts=42');
    expect(
      buildBest1mJobMonitorUrl({ exchangeKey: 'okx', serial: 'S9', forceReload: false, now: () => 42 })
    ).toBe('/api/jobs/main_page?v=S9&embed=1&exchange=okx&job_type=okx_best_1m');
  });

  it('falls back to serial 0 for a falsy serial (:4189 guard)', () => {
    expect(buildBest1mJobMonitorUrl({ exchangeKey: 'okx', serial: '', now: () => 0 })).toContain(
      '?v=0&'
    );
  });

  it('returns an empty URL for hyperliquid (no monitor meta)', () => {
    expect(buildBest1mJobMonitorUrl({ exchangeKey: 'hyperliquid', serial: 'S9', now: () => 0 })).toBe(
      ''
    );
  });
});

describe('buildCopyDataJobMonitorUrl (:4215-4222)', () => {
  it('embeds the ohlcv exchange with both copy job types', () => {
    expect(buildCopyDataJobMonitorUrl({ serial: 'S9', now: () => 0 })).toBe(
      '/api/jobs/main_page?v=S9&embed=1&exchange=ohlcv&job_type=ohlcv_copy%2Cohlcv_copy_dry_run'
    );
  });

  it('appends the _ts cache-bust on forceReload', () => {
    expect(buildCopyDataJobMonitorUrl({ serial: 'S9', forceReload: true, now: () => 7 })).toContain(
      '&_ts=7'
    );
  });
});

describe('buildHyperliquidDataActionsUrl (:7581-7582)', () => {
  it('targets the market-data router with the encoded section', () => {
    expect(buildHyperliquidDataActionsUrl('download', 'http://h:8/api/market-data')).toBe(
      'http://h:8/api/market-data/data-actions/hyperliquid?section=download'
    );
  });

  it('normalizes any non-download section to build (:7580)', () => {
    expect(buildHyperliquidDataActionsUrl('bogus', 'http://h:8/api/market-data')).toBe(
      'http://h:8/api/market-data/data-actions/hyperliquid?section=build'
    );
  });
});

describe('resolveJobMonitorSrc — mount idempotence (:4197-4213)', () => {
  it('returns the next src when it differs or when forced', () => {
    expect(resolveJobMonitorSrc('', '/api/jobs/main_page?v=1')).toBe('/api/jobs/main_page?v=1');
    expect(
      resolveJobMonitorSrc('/api/jobs/main_page?v=1', '/api/jobs/main_page?v=1', true)
    ).toBe('/api/jobs/main_page?v=1');
  });

  it('keeps the current src when unchanged and not forced', () => {
    expect(resolveJobMonitorSrc('/api/jobs/main_page?v=1', '/api/jobs/main_page?v=1')).toBeNull();
  });
});
