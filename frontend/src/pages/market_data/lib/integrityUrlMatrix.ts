import { getExchangeMeta } from './exchange';
import type { ExchangeOption } from '../types';

/*
 * The integrity job-monitor iframe URL matrix — legacy
 * mountIntegrityJobMonitor (market_data_main.html:4234-4250).
 *
 * The frame always embeds /app/jobs_monitor.html in embed mode with the
 * SERIAL cache-bust version; the job_type CSV varies by exchange:
 *
 *   every exchange :4238  scan + repair + repair_all + the two
 *                        removed-coin deletes
 *   hyperliquid    :4239  + ohlcv_hyperliquid_normalize_fallback
 *   bybit          :4240  + ohlcv_checksum_publish, ohlcv_checksum_reference
 */

/** Base job-type CSV (:4238). */
export const INTEGRITY_JOB_TYPES_BASE =
  'ohlcv_integrity_scan,ohlcv_integrity_repair,ohlcv_integrity_repair_all,ohlcv_removed_coin_delete,ohlcv_removed_coins_delete';

/** Hyperliquid-only extra (:4239). */
const HYPERLIQUID_JOB_TYPES = ['ohlcv_hyperliquid_normalize_fallback'];

/** Bybit-only extras (:4240). */
const BYBIT_JOB_TYPES = ['ohlcv_checksum_publish', 'ohlcv_checksum_reference'];

/** The job-type CSV for one storage exchange (statusKey). */
export function integrityJobTypes(statusKey: string): string {
  const types = [INTEGRITY_JOB_TYPES_BASE];
  if (statusKey === 'hyperliquid') types.push(HYPERLIQUID_JOB_TYPES.join(','));
  if (statusKey === 'bybit') types.push(BYBIT_JOB_TYPES.join(','));
  return types.filter(Boolean).join(',');
}

/** Resolves an exchange key/value to its storage exchange like :4237. */
export function integrityMonitorStatusKey(exchange: unknown): string {
  const meta: ExchangeOption = getExchangeMeta(exchange);
  return meta.statusKey;
}

export interface BuildIntegrityJobMonitorUrlOptions {
  /** Storage exchange (statusKey) of the context exchange (:4243). */
  statusKey: string;
  /** PBGUI_SERIAL (:4241) — falsy falls back to '0' like the legacy guard. */
  serial: string;
  /** Cache-bust flag (:4245). */
  forceReload?: boolean;
  /** Clock for the _ts value (injectable for tests). */
  now?: () => number;
}

/** Legacy URL assembly :4241-4245. */
export function buildIntegrityJobMonitorUrl(options: BuildIntegrityJobMonitorUrlOptions): string {
  const url =
    '/app/jobs_monitor.html?v=' +
    encodeURIComponent(options.serial || '0') +
    '&embed=1' +
    '&exchange=' +
    encodeURIComponent(options.statusKey) +
    '&job_type=' +
    encodeURIComponent(integrityJobTypes(options.statusKey));
  if (options.forceReload) return url + '&_ts=' + (options.now?.() ?? Date.now());
  return url;
}
