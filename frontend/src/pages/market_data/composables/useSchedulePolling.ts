/*
 * M-data-7 — the 15 s copy-data schedule poll, panel-gated like the M-data-5
 * integrity chain (recon R5). Port of loadCopyDataSchedules /
 * stopCopyDataSchedulePoll (market_data_main.html :5062-5153):
 *
 *   - every load first stops the pending timer (:5128);
 *   - an incrementing requestId drops responses from superseded loads
 *     (:5129-5133, :5140);
 *   - success:false payloads fail with the server error (:5134-5136);
 *   - errors surface to the feedback box only when showErrors is set
 *     (:5141-5144) — the recurring chain always re-arms with showErrors off;
 *   - the finally block re-arms the 15 s timer, but only while the panel is
 *     active and the request is still current (:5145-5151) — the chain dies
 *     silently when the user switched away mid-flight.
 *
 * Deviation (documented, R4/R5 hardening — mirrors useIntegrityPolling):
 * stop() bumps the generation so an in-flight load can never re-arm a timer
 * after the panel was left; legacy relied on the hidden-check alone, which
 * raced when the panel was re-entered before the fetch resolved.
 */

import type { CopyScheduleRow } from '../lib/copySchedules';

/** Legacy poll interval (:5148-5150). */
export const SCHEDULE_POLL_INTERVAL_MS = 15000;

/** Legacy GET /copy-data/schedules response slice. */
export interface SchedulesPayload {
  success?: boolean;
  error?: string;
  schedules?: unknown;
  [key: string]: unknown;
}

export interface UseSchedulePollingOptions {
  fetchSchedules(): Promise<SchedulesPayload>;
  onSchedules(schedules: CopyScheduleRow[]): void;
  /** Feedback sink for the showErrors path (:5143). */
  onError(message: string): void;
  /** Legacy `!panel.hidden` check (:5146-5147). */
  isPanelActive(): boolean;
  /** t('market.failedLoadCopySchedules'). */
  failureMessage(): string;
  /** PBGuiI18n.serverMsg (:5142). */
  serverMessage(message: string): string;
  intervalMs?: number;
  /** Injectables for tests. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface SchedulePollingController {
  /** loadCopyDataSchedules(:5127) — showErrors defaults to true. */
  load(showErrors?: boolean): Promise<void>;
  /** stopCopyDataSchedulePoll (:5062-5067). */
  stop(): void;
}

export function useSchedulePolling(options: UseSchedulePollingOptions): SchedulePollingController {
  const intervalMs = options.intervalMs ?? SCHEDULE_POLL_INTERVAL_MS;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let timer: ReturnType<typeof setTimeoutFn> | null = null;
  let requestId = 0; // copyDataScheduleState.requestId (:3810)

  function stop(): void {
    if (timer !== null) {
      clearTimeoutFn(timer); // :5063-5066
      timer = null;
    }
    requestId += 1; // R4/R5 hardening — stale in-flight loads stop re-arming
  }

  async function load(showErrors = true): Promise<void> {
    if (timer !== null) {
      clearTimeoutFn(timer); // :5128
      timer = null;
    }
    requestId += 1; // :5129
    const currentRequest = requestId;
    try {
      const result = await options.fetchSchedules(); // :5132
      if (currentRequest !== requestId) return; // :5133
      if (!result || result.success === false) {
        throw new Error(
          (result && result.error) || options.failureMessage()
        ); // :5134-5136
      }
      options.onSchedules(Array.isArray(result.schedules) ? (result.schedules as CopyScheduleRow[]) : []); // :5137
    } catch (error) {
      if (currentRequest !== requestId) return; // :5140
      if (showErrors !== false) {
        const message =
          error instanceof Error && error.message
            ? options.serverMessage(error.message)
            : options.failureMessage(); // :5142
        options.onError(message); // :5143
      }
    } finally {
      if (
        options.isPanelActive() &&
        currentRequest === requestId
      ) {
        timer = setTimeoutFn(() => {
          void load(false); // :5148-5150 — recurring chain is quiet
        }, intervalMs);
      }
    }
  }

  return { load, stop };
}
