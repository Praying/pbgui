import { describe, expect, it } from 'vitest';
import {
  INTEGRITY_JOB_TYPES_BASE,
  buildIntegrityJobMonitorUrl,
  integrityJobTypes,
} from './integrityUrlMatrix';

/* Job-monitor iframe URL matrix — legacy mountIntegrityJobMonitor
   (market_data_main.html:4234-4250): base job-type CSV :4238, the
   hyperliquid normalize-fallback extra :4239, the bybit checksum extras
   :4240, URL assembly :4241-4245. */

describe('integrityJobTypes (:4238-4240)', () => {
  it('uses the base five types for binance/okx/bitget', () => {
    const base = 'ohlcv_integrity_scan,ohlcv_integrity_repair,ohlcv_integrity_repair_all,ohlcv_removed_coin_delete,ohlcv_removed_coins_delete';
    expect(INTEGRITY_JOB_TYPES_BASE).toBe(base);
    expect(integrityJobTypes('binanceusdm')).toBe(base);
    expect(integrityJobTypes('okx')).toBe(base);
    expect(integrityJobTypes('bitget')).toBe(base);
  });

  it('adds the hyperliquid normalize-fallback type (:4239)', () => {
    expect(integrityJobTypes('hyperliquid')).toBe(
      'ohlcv_integrity_scan,ohlcv_integrity_repair,ohlcv_integrity_repair_all,ohlcv_removed_coin_delete,ohlcv_removed_coins_delete,ohlcv_hyperliquid_normalize_fallback'
    );
  });

  it('adds the bybit checksum publish/reference types (:4240)', () => {
    expect(integrityJobTypes('bybit')).toBe(
      'ohlcv_integrity_scan,ohlcv_integrity_repair,ohlcv_integrity_repair_all,ohlcv_removed_coin_delete,ohlcv_removed_coins_delete,ohlcv_checksum_publish,ohlcv_checksum_reference'
    );
  });

  it('does not stack extras for the other exchanges', () => {
    expect(integrityJobTypes('bybit')).not.toContain('normalize');
    expect(integrityJobTypes('hyperliquid')).not.toContain('checksum_publish');
  });
});

describe('buildIntegrityJobMonitorUrl (:4241-4245)', () => {
  it('assembles the embed URL with serial, exchange and encoded job types', () => {
    expect(buildIntegrityJobMonitorUrl({ statusKey: 'bybit', serial: 'S42' })).toBe(
      '/app/jobs_monitor.html?v=S42&embed=1&exchange=bybit' +
        '&job_type=' +
        encodeURIComponent(
          'ohlcv_integrity_scan,ohlcv_integrity_repair,ohlcv_integrity_repair_all,ohlcv_removed_coin_delete,ohlcv_removed_coins_delete,ohlcv_checksum_publish,ohlcv_checksum_reference'
        )
    );
  });

  it('falls back to serial 0 like the legacy PBGUI_SERIAL guard (:4241)', () => {
    const url = buildIntegrityJobMonitorUrl({ statusKey: 'okx', serial: '' });
    expect(url.startsWith('/app/jobs_monitor.html?v=0&embed=1&exchange=okx&job_type=')).toBe(true);
  });

  it('appends the _ts cache-bust only on forceReload (:4245)', () => {
    const forced = buildIntegrityJobMonitorUrl({
      statusKey: 'bybit',
      serial: 'S1',
      forceReload: true,
      now: () => 1234,
    });
    expect(forced.endsWith('&_ts=1234')).toBe(true);
    const idle = buildIntegrityJobMonitorUrl({ statusKey: 'bybit', serial: 'S1', now: () => 1234 });
    expect(idle.includes('_ts')).toBe(false);
  });
});
