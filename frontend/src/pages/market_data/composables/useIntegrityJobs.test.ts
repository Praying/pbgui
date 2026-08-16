import { describe, expect, it } from 'vitest';
import { INTEGRITY_POLL_JOB_TYPES, hasActiveIntegrityJob } from './useIntegrityJobs';

/* The 2 s poll's job filter — legacy pollIntegrityJobs
   (market_data_main.html:4573-4589): the integrity type set, and the rule
   that publish/reference jobs count on every exchange while the rest must
   match the selected exchange. */

describe('INTEGRITY_POLL_JOB_TYPES (:4573-4582)', () => {
  it('is the exact legacy eight-type set', () => {
    expect([...INTEGRITY_POLL_JOB_TYPES].sort()).toEqual(
      [
        'ohlcv_integrity_scan',
        'ohlcv_hyperliquid_normalize_fallback',
        'ohlcv_integrity_repair',
        'ohlcv_integrity_repair_all',
        'ohlcv_removed_coin_delete',
        'ohlcv_removed_coins_delete',
        'ohlcv_checksum_publish',
        'ohlcv_checksum_reference',
      ].sort()
    );
  });
});

describe('hasActiveIntegrityJob (:4583-4589)', () => {
  it('matches a same-exchange integrity job', () => {
    expect(
      hasActiveIntegrityJob(
        { jobs: [{ type: 'ohlcv_integrity_scan', exchange: 'bybit' }] },
        'bybit'
      )
    ).toBe(true);
  });

  it('ignores integrity jobs for a different exchange', () => {
    expect(
      hasActiveIntegrityJob(
        { jobs: [{ type: 'ohlcv_integrity_scan', exchange: 'bybit' }] },
        'okx'
      )
    ).toBe(false);
  });

  it('counts checksum publish/reference jobs on any exchange (:4587)', () => {
    expect(
      hasActiveIntegrityJob(
        { jobs: [{ type: 'ohlcv_checksum_publish', exchange: 'bybit' }] },
        'okx'
      )
    ).toBe(true);
    expect(
      hasActiveIntegrityJob(
        { jobs: [{ type: 'ohlcv_checksum_reference', exchange: '' }] },
        'okx'
      )
    ).toBe(true);
  });

  it('ignores foreign job types', () => {
    expect(
      hasActiveIntegrityJob(
        { jobs: [{ type: 'binance_best_1m', exchange: 'binanceusdm' }] },
        'binanceusdm'
      )
    ).toBe(false);
    expect(hasActiveIntegrityJob({ jobs: [{ type: '' }] }, 'bybit')).toBe(false);
  });

  it('tolerates missing or malformed jobs arrays (:4584)', () => {
    expect(hasActiveIntegrityJob({}, 'bybit')).toBe(false);
    expect(hasActiveIntegrityJob({ jobs: 'nope' }, 'bybit')).toBe(false);
    expect(hasActiveIntegrityJob({ jobs: [null, { type: null }] }, 'bybit')).toBe(false);
  });
});
