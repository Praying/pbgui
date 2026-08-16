/*
 * Coin Data refresh jobs — the reactive port of coin_data.html
 * :2036-2262: runRefresh (:2230-2262), pollRefreshJob (:2184-2209) and
 * startRefreshJobPolling (:2211-2228, 350 ms interval). The busy overlay
 * state (:2041-2071) moves into refs; applyServerState lands through the
 * page store.
 */

import { ref, type Ref } from 'vue';
import { apiFetch, ApiError } from '@/shared/api';
import { apiUrl } from '../config';
import type { CoinDataRefreshJob, CoinDataState } from '../types';
import type { TranslateFn } from './useCoinDataState';

const POLL_INTERVAL_MS = 350; // :2227

export type RefreshPath = '/refresh/exchange' | '/refresh/all' | '/refresh/cmc' | '/refresh/cmc_all';

export interface BusyState {
  visible: boolean;
  title: string;
  percent: number;
  subtle: string;
}

export interface UseRefreshJobs {
  busy: Ref<BusyState>;
  isRefreshing: Ref<boolean>;
  runRefresh(path: RefreshPath, busyTitle: string, okFallback: string): Promise<void>;
  stop(): void;
}

export function useRefreshJobs(options: {
  t: TranslateFn;
  /** Current filter payload for the POST body (:2236-2242). */
  getPayload(): {
    exchange: string;
    market_cap: number;
    vol_mcap: number;
    tags: string[];
    only_cpt: boolean;
  };
  applyState(state: CoinDataState): void;
  setStatus(message: string, isError: boolean): void;
}): UseRefreshJobs {
  const t = options.t;
  const busy = ref<BusyState>({ visible: false, title: '', percent: 0, subtle: '' });
  const isRefreshing = ref(false);

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let busyJobId = '';

  /** updateBusyProgress (:2041-2051) — the '.0'-stripped label is render-side. */
  function updateProgress(percent: number, subtle: string): void {
    const safePercent = typeof percent === 'number' && isFinite(percent)
      ? Math.max(0, Math.min(100, percent))
      : 0;
    busy.value = {
      ...busy.value,
      percent: safePercent,
      subtle: typeof subtle === 'string' ? subtle : busy.value.subtle,
    };
  }

  function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    busyJobId = '';
  }

  function showBusy(title: string, subtle: string): void {
    stopPolling();
    busy.value = { visible: true, title: title || t('market.working'), percent: 0, subtle: subtle || t('market.pleaseWait') };
  }

  function hideBusy(): void {
    stopPolling();
    busy.value = { ...busy.value, visible: false };
  }

  /** pollRefreshJob (:2184-2209). */
  async function pollRefreshJob(jobId: string, okFallback: string): Promise<void> {
    let job: CoinDataRefreshJob;
    try {
      const payload = await apiFetch<{ job: CoinDataRefreshJob }>(
        apiUrl('/refresh/jobs/' + encodeURIComponent(jobId)),
        { cache: 'no-store' }
      );
      job = payload.job || ({} as CoinDataRefreshJob);
    } catch (error) {
      // legacy error text (:2188-2190): '<status>: <detail>' from the JSON body
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : String(error);
      throw new Error(message);
    }
    if (busyJobId !== jobId) return;
    updateProgress(Number(job.percent || 0), job.message || t('market.working'));
    if (job.status === 'completed') {
      if (job.state) options.applyState(job.state);
      options.setStatus(job.result_message || okFallback, false);
      hideBusy();
      return;
    }
    if (job.status === 'error') {
      options.setStatus(job.error || job.message || t('market.refreshFailed'), true);
      hideBusy();
    }
  }

  /** startRefreshJobPolling (:2211-2228). */
  function startPolling(jobId: string, okFallback: string): void {
    stopPolling();
    busyJobId = jobId;
    void pollRefreshJob(jobId, okFallback).catch((error: Error) => {
      if (busyJobId !== jobId) return;
      options.setStatus(error.message, true);
      hideBusy();
    });
    pollTimer = setInterval(() => {
      void pollRefreshJob(jobId, okFallback).catch((error: Error) => {
        if (busyJobId !== jobId) return;
        options.setStatus(error.message, true);
        hideBusy();
      });
    }, POLL_INTERVAL_MS);
  }

  /** runRefresh (:2230-2262). */
  async function runRefresh(path: RefreshPath, busyTitle: string, okFallback: string): Promise<void> {
    showBusy(busyTitle, t('market.startingRefresh'));
    options.setStatus(busyTitle + '...', false);
    isRefreshing.value = true;
    try {
      const payload = await apiFetch<{ ok?: boolean; job_id?: string }>(apiUrl(path), {
        method: 'POST',
        body: JSON.stringify(options.getPayload()),
      });
      if (!payload.job_id) {
        throw new Error(t('market.refreshNoJobId'));
      }
      startPolling(String(payload.job_id), okFallback);
    } catch (error) {
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : String(error);
      options.setStatus(message, true);
      hideBusy();
    } finally {
      isRefreshing.value = false;
    }
  }

  function stop(): void {
    stopPolling();
    busy.value = { ...busy.value, visible: false };
  }

  return { busy, isRefreshing, runRefresh, stop };
}
