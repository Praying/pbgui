/*
 * The 2 s integrity poll's job filter — legacy pollIntegrityJobs
 * (market_data_main.html:4573-4589).
 *
 * The poll asks /jobs/ for pending+running jobs and needs to know whether
 * any *integrity* job is active: the eight integrity types, with checksum
 * publish/reference counting on every exchange (they are global jobs) and
 * everything else scoped to the selected storage exchange.
 */

/** Legacy integrityTypes set verbatim (:4573-4582). */
export const INTEGRITY_POLL_JOB_TYPES: ReadonlySet<string> = new Set([
  'ohlcv_integrity_scan',
  'ohlcv_hyperliquid_normalize_fallback',
  'ohlcv_integrity_repair',
  'ohlcv_integrity_repair_all',
  'ohlcv_removed_coin_delete',
  'ohlcv_removed_coins_delete',
  'ohlcv_checksum_publish',
  'ohlcv_checksum_reference',
]);

/** Job types that run regardless of the selected exchange (:4587). */
const EXCHANGE_AGNOSTIC_TYPES: ReadonlySet<string> = new Set([
  'ohlcv_checksum_publish',
  'ohlcv_checksum_reference',
]);

/** Shape the /jobs/ endpoint answers with (only the fields the poll reads). */
export interface JobsListPayload {
  jobs?: unknown;
  [key: string]: unknown;
}

interface JobLike {
  type?: unknown;
  exchange?: unknown;
}

/** One job's slice of the :4583-4589 predicate. */
export function isIntegrityJobActive(job: unknown, selectedExchange: string): boolean {
  if (!job || typeof job !== 'object') return false;
  const entry = job as JobLike;
  const jobType = String(entry.type ?? '');
  if (!INTEGRITY_POLL_JOB_TYPES.has(jobType)) return false;
  if (EXCHANGE_AGNOSTIC_TYPES.has(jobType)) return true;
  return String(entry.exchange ?? '') === selectedExchange;
}

/** True when any polled job keeps the integrity panel busy (:4583-4589). */
export function hasActiveIntegrityJob(payload: JobsListPayload, selectedExchange: string): boolean {
  const jobs = Array.isArray(payload?.jobs) ? (payload.jobs as unknown[]) : [];
  return jobs.some((job) => isIntegrityJobActive(job, selectedExchange));
}
