import { getExchangeMeta } from './exchange';
import { BEST1M_QUEUE_META } from './inventoryQueueConfig';

/*
 * M-data-7 — best-1m + copy-data URL matrices and mount rules. Pure path
 * builders; the api layer (config.ts/useApi.ts) owns the base joins.
 *
 *   best1mJobMonitorMeta          :3751-3756 (status exchange + job-type CSV)
 *   best1mQueueMeta               :3757-3763 (ported by M-data-6 as
 *                                    BEST1M_QUEUE_META — reused here)
 *   buildBest1mJobMonitorUrl      :4185-4195
 *   mountBest1mJobMonitor         :4197-4213
 *   buildCopyDataJobMonitorUrl    :4215-4222
 *   mountHyperliquidDataActions   :7577-7586
 *   queueBest1mGeneric routing    :7693-7699 (hyperliquid delegates to the
 *                                    embedded data-actions iframe)
 *   inputDayToBest1m              :5524-5526
 */

/** Legacy best1mJobMonitorMeta (:3751-3756) — verbatim; hyperliquid has no
 *  entry (its panel is the hl_data_actions iframe instead). */
export const BEST1M_JOB_MONITOR_META: Readonly<
  Record<string, { exchange: string; jobType: string }>
> = {
  binance: { exchange: 'binanceusdm', jobType: 'binance_best_1m' },
  bybit: { exchange: 'bybit', jobType: 'bybit_best_1m' },
  bitget: { exchange: 'bitget', jobType: 'bitget_best_1m,bitget_best_1m_distributed' },
  okx: { exchange: 'okx', jobType: 'okx_best_1m' },
};

/**
 * The best-1m form's queue route matrix (:7693-7699 + :3757-3763):
 * hyperliquid has no form path — the queue button reopens the embedded
 * data-actions iframe instead, so it resolves to null. Every other exchange
 * posts to its own /best-1m/queue route on the market-data router.
 */
export function best1mQueueRoute(
  exchange: unknown
): { api: 'market-data'; path: string } | null {
  const meta = getExchangeMeta(exchange);
  if (meta.key === 'hyperliquid') return null; // :7695-7697 iframe path
  return { api: 'market-data', path: `/best-1m/queue/${meta.key}` };
}

export interface BuildBest1mJobMonitorUrlOptions {
  exchangeKey: unknown;
  /** PBGUI_SERIAL (:4189) — falsy falls back to '0'. */
  serial: string;
  forceReload?: boolean;
  now?: () => number;
}

/** Legacy URL assembly :4185-4195; '' when the exchange has no monitor meta. */
export function buildBest1mJobMonitorUrl(options: BuildBest1mJobMonitorUrlOptions): string {
  const meta = getExchangeMeta(options.exchangeKey);
  const jobMeta = BEST1M_JOB_MONITOR_META[meta.key];
  if (!jobMeta) return ''; // :4188
  const url =
    '/api/jobs/main_page?v=' +
    encodeURIComponent(options.serial || '0') +
    '&embed=1' +
    '&exchange=' +
    encodeURIComponent(jobMeta.exchange) +
    '&job_type=' +
    encodeURIComponent(jobMeta.jobType);
  if (options.forceReload) return url + '&_ts=' + (options.now?.() ?? Date.now()); // :4193
  return url;
}

export interface BuildCopyDataJobMonitorUrlOptions {
  serial: string;
  forceReload?: boolean;
  now?: () => number;
}

/** Legacy URL assembly :4215-4222 — the ohlcv copy monitor is exchange-fixed. */
export function buildCopyDataJobMonitorUrl(options: BuildCopyDataJobMonitorUrlOptions): string {
  const url =
    '/api/jobs/main_page?v=' +
    encodeURIComponent(options.serial || '0') +
    '&embed=1' +
    '&exchange=ohlcv' +
    '&job_type=' +
    encodeURIComponent('ohlcv_copy,ohlcv_copy_dry_run');
  if (options.forceReload) return url + '&_ts=' + (options.now?.() ?? Date.now()); // :4220
  return url;
}

/**
 * Legacy frame mount rule (:4209-4212, :7582-7585): the src is only
 * reassigned when it actually changes or when a forced reload is requested —
 * a same-src assignment would still remount the iframe document.
 *
 * @returns the next src to apply, or null to keep the current one.
 */
export function resolveJobMonitorSrc(current: string, next: string, forceReload?: boolean): string | null {
  if (forceReload === true || current !== next) return next;
  return null;
}

/** The data-actions iframe path with the normalized, encoded section (:7580-7581). */
export function hyperliquidDataActionsPath(section: unknown): string {
  const targetSection = section === 'download' ? 'download' : 'build'; // :7580
  return `/data-actions/hyperliquid?section=${encodeURIComponent(targetSection)}`;
}

/** Legacy hyperliquid iframe URL (:7580-7582) — base + path. */
export function buildHyperliquidDataActionsUrl(
  section: unknown,
  marketDataApiBase: string
): string {
  return marketDataApiBase + hyperliquidDataActionsPath(section);
}

/** Legacy inputDayToBest1m (:5524-5526) — yyyy-mm-dd → yyyymmdd. */
export function inputDayToBest1m(value: unknown): string {
  return String(value ?? '').replace(/-/g, '');
}
