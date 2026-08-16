/*
 * M-data-7 — the dry-run summary poll. Port of the legacy trio
 * (market_data_main.html :5256-5523):
 *
 *   resetCopyDataDryRunSummary   :5256-5267  stop timer + stale + hide box
 *   scheduleCopyDataDryRun…Poll  :5478-5483  900 ms while attempt < 3, else
 *                                           1800 ms
 *   pollCopyDataDryRunSummary    :5485-5511  job status render; done/failed
 *                                           → log fetch + structured/log
 *                                           merge + monitor remount; attempt
 *                                           caps 180 (success) / 20 (error)
 *   startCopyDataDryRunSummary   :5513-5522  stop timer + render queued +
 *                                           first poll
 *
 * The render payload is the DryRunSummaryData model (lib/dryRunLog.ts) — the
 * store renders it through computeDryRunSummaryView.
 */

import {
  copyDataDryRunStatsFromJob,
  mergeCopyDataDryRunStats,
  parseCopyDataDryRunLog,
  type DryRunJobPayload,
  type DryRunStats,
  type DryRunSummaryData,
} from '../lib/dryRunLog';
import type { TranslateFn } from './useSettings';

/** Fast backoff while attempt < 3 (:5482). */
export const DRY_RUN_FAST_INTERVAL_MS = 900;
/** Slow backoff afterwards (:5482). */
export const DRY_RUN_SLOW_INTERVAL_MS = 1800;
/** Success-path attempt cap (:5502). */
export const DRY_RUN_MAX_ATTEMPTS = 180;
/** Error-path attempt cap (:5507). */
export const DRY_RUN_MAX_ERROR_ATTEMPTS = 20;

export interface UseDryRunPollOptions {
  /** fetchJobsJson('/jobs/{id}'). */
  fetchJob(jobId: string): Promise<DryRunJobPayload>;
  /** fetchJobsJson('/jobs/{id}/log?lines=500'). */
  fetchLog(jobId: string): Promise<{ log?: unknown }>;
  /** renderCopyDataDryRunSummary (:5493, :5498, :5506). */
  render(view: DryRunSummaryData): void;
  /** mountCopyDataJobMonitor(true) after a settled job (:5499). */
  onFinished(): void;
  /** vue-i18n t — exchangeStatLine + the fallback keys. */
  translate: TranslateFn;
  /** PBGuiI18n.serverMsg (:5506). */
  serverMessage(message: string): string;
  /** Injectables for tests. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface DryRunPollController {
  /** startCopyDataDryRunSummary (:5513-5522). */
  start(result: { job_id?: unknown }): void;
  /** resetCopyDataDryRunSummary (:5256-5261) — timer + staleness only. */
  reset(): void;
}

export function useDryRunPoll(options: UseDryRunPollOptions): DryRunPollController {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let timer: ReturnType<typeof setTimeoutFn> | null = null;
  let requestId = 0; // copyDataDryRunState.requestId (:3803)

  function stopTimer(): void {
    if (timer !== null) {
      clearTimeoutFn(timer); // :5257-5260 / :5515-5517
      timer = null;
    }
  }

  /** Legacy backoff (:5482). */
  function schedule(result: { job_id?: unknown }, currentRequest: number, attempt: number): void {
    if (currentRequest !== requestId) return; // :5479
    timer = setTimeoutFn(() => {
      void poll(result, currentRequest, attempt + 1);
    }, attempt < 3 ? DRY_RUN_FAST_INTERVAL_MS : DRY_RUN_SLOW_INTERVAL_MS);
  }

  async function poll(result: { job_id?: unknown }, currentRequest: number, attempt: number): Promise<void> {
    if (currentRequest !== requestId) return; // :5486
    const jobId = String(result && result.job_id ? result.job_id : '').trim();
    if (!jobId) return; // :5487-5488
    try {
      const job = await options.fetchJob(jobId); // :5490
      const status = String(job && job.status ? job.status : 'running').toLowerCase(); // :5491
      const structuredStats = copyDataDryRunStatsFromJob(job, options.translate); // :5492
      options.render({ result, job, status, stats: structuredStats }); // :5493
      if (status === 'done' || status === 'failed') {
        const logPayload = await options.fetchLog(jobId); // :5495
        const lines = logPayload && Array.isArray(logPayload.log) ? logPayload.log : []; // :5496
        const logStats = parseCopyDataDryRunLog(lines); // :5497
        const merged: DryRunStats = mergeCopyDataDryRunStats(structuredStats, logStats);
        options.render({
          result,
          job,
          status,
          stats: merged,
          error:
            status === 'failed'
              ? String(job.error || options.translate('market.dryRunFailed'))
              : '', // :5498
        });
        options.onFinished(); // mountCopyDataJobMonitor(true) :5499
        return;
      }
      if (attempt < DRY_RUN_MAX_ATTEMPTS) {
        schedule(result, currentRequest, attempt); // :5502-5504
      }
    } catch (error) {
      options.render({
        result,
        status: 'unknown',
        error:
          error instanceof Error && error.message
            ? options.serverMessage(error.message)
            : options.translate('market.failedLoadDryRunSummary'), // :5506
      });
      if (attempt < DRY_RUN_MAX_ERROR_ATTEMPTS) {
        schedule(result, currentRequest, attempt); // :5507-5509
      }
    }
  }

  return {
    start(result: { job_id?: unknown }): void {
      stopTimer(); // :5514-5517
      requestId += 1; // :5518
      options.render({ result, status: 'queued' }); // :5520
      void poll(result, requestId, 0); // :5521
    },
    reset(): void {
      stopTimer(); // :5257-5260
      requestId += 1; // :5261 — stale every in-flight poll
    },
  };
}
