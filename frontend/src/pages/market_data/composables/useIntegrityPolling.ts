import { hasActiveIntegrityJob, type JobsListPayload } from './useIntegrityJobs';

/*
 * The 2 s integrity job poll — legacy stopIntegrityPolling /
 * pollIntegrityJobs / startIntegrityPolling (market_data_main.html:
 * 4557-4605), gated by panel activation (recon R5):
 *
 *   - a tick asks /jobs/?states=pending,running&limit=100 whether any
 *     integrity job is active for the selected exchange;
 *   - active → remember it; idle after activity (and not mid-save) →
 *     reload the panel once (:4590-4595);
 *   - when the panel is inactive the tick returns without rescheduling —
 *     the chain dies silently (:4564-4565); App stops it on panel leave;
 *   - fetch failures are swallowed and the chain continues (:4596-4599).
 *
 * Deviations (documented, R4/R5 hardening):
 *   - start() is idempotent. Legacy restart could leave two chains behind
 *     when a slow tick resolved after a restart (the old invocation still
 *     armed its own setTimeout); a generation counter now drops those.
 *   - stop() bumps the generation so an in-flight tick never reschedules.
 */

/** Legacy poll interval (:4599). */
export const INTEGRITY_POLL_INTERVAL_MS = 2000;

/** Legacy poll URL (:4568). */
export const INTEGRITY_POLL_JOBS_PATH = '/jobs/?states=pending,running&limit=100';

export interface UseIntegrityPollingOptions {
  /** fetchJobsJson-bound GET (adds the no-store cache mode). */
  fetchJobs(path: string): Promise<JobsListPayload>;
  /** Legacy `panel.classList.contains('active-panel')` check (:4564-4565). */
  isPanelActive(): boolean;
  /** Storage exchange of the current context (:4583). */
  getSelectedExchange(): string;
  /** integrityState.saving (:4592). */
  isSaving(): boolean;
  /** loadIntegrityPanel(false) on idle-after-activity (:4594). */
  reloadPanel(): Promise<void> | void;
  intervalMs?: number;
}

export interface IntegrityPollingController {
  /** startIntegrityPolling (:4602-4605) — idempotent (see header note). */
  start(): void;
  /** stopIntegrityPolling (:4557-4560). */
  stop(): void;
  isPolling(): boolean;
  /** integrityState.hadActiveJob (:4591). */
  hadActiveJob(): boolean;
  /** Queued operations mark the poll active (:4644, :4879). */
  markActiveJob(): void;
}

export function useIntegrityPolling(options: UseIntegrityPollingOptions): IntegrityPollingController {
  const intervalMs = options.intervalMs ?? INTEGRITY_POLL_INTERVAL_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let running = false;
  let hadActive = false; // integrityState.hadActiveJob (:3730)

  async function run(gen: number): Promise<void> {
    if (!options.isPanelActive()) return; // :4564-4565 — chain dies here
    try {
      const payload = await options.fetchJobs(INTEGRITY_POLL_JOBS_PATH); // :4567-4572
      if (gen !== generation) return; // stopped/restarted mid-flight
      if (hasActiveIntegrityJob(payload, options.getSelectedExchange())) {
        hadActive = true; // :4590-4591
      } else if (hadActive && !options.isSaving()) {
        hadActive = false; // :4593
        await options.reloadPanel(); // :4594
      }
    } catch {
      /* :4596-4598 — keep polling */
    }
    if (gen !== generation) return; // re-check after the awaits
    timer = setTimeout(() => void run(gen), intervalMs); // :4599
  }

  return {
    start(): void {
      if (running) return; // R5 hardening — no double chain
      running = true;
      generation += 1;
      void run(generation);
    },
    stop(): void {
      running = false;
      generation += 1; // drop any in-flight tick's reschedule
      if (timer !== null) {
        clearTimeout(timer); // :4558-4559
        timer = null;
      }
    },
    isPolling(): boolean {
      return running;
    },
    hadActiveJob(): boolean {
      return hadActive;
    },
    markActiveJob(): void {
      hadActive = true; // :4644 / :4879
    },
  };
}
