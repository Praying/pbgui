/*
 * The two data-action sections — the reactive port of hl_data_actions.html
 * doInit (:936-963), populateDownload (:968-1005), populateBuild
 * (:1010-1053), the submit pair (:1555-1592) and the message helpers
 * (:1594-1612). Selection/filter state moves from closure vars (:528-532)
 * into refs; the queue payload rules stay byte-identical.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { apiFetch } from '@/shared/api';
import { apiUrl } from '../config';
import { buildVisibleCoins, downloadVisibleCoins, queueCoinsParam, sortPickerCoins } from '../lib/buildFilters';
import { buildQueuedMessageParts } from '../lib/queuedMessage';
import { buildDateValueToMs, inputToDay } from '../lib/jobsFormat';
import type { BuildOhlcvInfo, L2bookDownloadInfo, QueueReply, SectionNs } from '../types';

const INIT_MAX_RETRIES = 3; // :934
const INIT_RETRY_DELAY_MS = 1500;

export type SectionMessage = { kind: 'success' | 'warning' | 'error'; text: string; parts?: ReturnType<typeof buildQueuedMessageParts> } | null;

export interface UseHldaSections {
  /* init */
  initPhase: Ref<'loading' | 'retrying' | 'failed' | 'ready'>;
  initRetry: Ref<number>;
  init(): void;
  /* download section */
  dlCoins: Ref<string[]>;
  dlSelected: Ref<Set<string>>;
  dlFilter: Ref<string>;
  dlHasCreds: Ref<boolean>;
  dlArchive: Ref<{ oldest_day: string; newest_day: string }>;
  dlStartDate: Ref<string>;
  dlEndDate: Ref<string>;
  dlOnlyMissing: Ref<boolean>;
  dlMessage: Ref<SectionMessage>;
  dlBusy: Ref<boolean>;
  dlVisibleCoins: ComputedRef<string[]>;
  dlRenderedCoins: ComputedRef<string[]>;
  /* build section */
  buildCoins: Ref<string[]>;
  buildSelected: Ref<Set<string>>;
  buildFilter: Ref<string>;
  buildTradfiOnly: Ref<boolean>;
  buildNoLocalData: Ref<boolean>;
  buildCoinsWithDownloadedHistory: Ref<Set<string>>;
  buildEmptyReason: Ref<string>;
  buildRetryable: Ref<boolean>;
  buildInfoRetrying: Ref<boolean>;
  buildRetryAttempt: Ref<number>;
  buildStartDate: Ref<string>;
  buildEndDate: Ref<string>;
  buildRefetch: Ref<boolean>;
  buildMessage: Ref<SectionMessage>;
  buildBusy: Ref<boolean>;
  buildVisibleList: ComputedRef<string[]>;
  buildRenderedCoins: ComputedRef<string[]>;
  /* actions */
  setDlSelected(coin: string, selected: boolean): void;
  setBuildSelected(coin: string, selected: boolean): void;
  dlSelectVisible(): void;
  dlClearSelection(): void;
  buildSelectVisible(): void;
  buildClearSelection(): void;
  toggleTradfiOnly(): void;
  toggleNoLocalData(): void;
  submitDownload(): Promise<void>;
  submitBuild(): Promise<void>;
  ensureBuildDateOrder(changed: 'start' | 'end', silent?: boolean): boolean;
  dispose(): void;
}

export function useHldaSections(options: { t: (key: string, params?: Record<string, unknown>) => string }): UseHldaSections {
  const t = options.t;

  const initPhase = ref<'loading' | 'retrying' | 'failed' | 'ready'>('loading');
  const initRetry = ref(0);

  const dlCoins = ref<string[]>([]);
  const dlSelected = ref<Set<string>>(new Set());
  const dlFilter = ref('');
  const dlHasCreds = ref(false);
  const dlArchive = ref({ oldest_day: '', newest_day: '' });
  const dlStartDate = ref('');
  const dlEndDate = ref('');
  const dlOnlyMissing = ref(true);
  const dlMessage = ref<SectionMessage>(null);
  const dlBusy = ref(false);

  const buildCoins = ref<string[]>([]);
  const buildSelected = ref<Set<string>>(new Set());
  const buildFilter = ref('');
  const buildTradfiOnly = ref(false);
  const buildNoLocalData = ref(false);
  const buildCoinsWithDownloadedHistory = ref<Set<string>>(new Set());
  const buildEmptyReason = ref('');
  const buildRetryable = ref(false);
  const buildInfoRetrying = ref(false);
  const buildRetryAttempt = ref(0);
  const buildStartDate = ref('');
  const buildEndDate = ref('');
  const buildRefetch = ref(false);
  const buildMessage = ref<SectionMessage>(null);
  const buildBusy = ref(false);

  const BUILD_INFO_MAX_RETRIES = 12;
  const BUILD_INFO_RETRY_DELAY_MS = 5000;
  let initGeneration = 0;
  let buildInfoRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let initRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function isRetryableBuildInfoError(error: unknown): boolean {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : 0;
    return !status || status === 408 || status === 425 || status === 429 || status >= 500;
  }

  function applyBuildInfo(data: BuildOhlcvInfo): void {
    buildCoins.value = data.eligible_coins || [];
    buildCoinsWithDownloadedHistory.value = new Set(data.coins_with_downloaded_history || []);
    buildEmptyReason.value = String(data.empty_reason || '');
    buildRetryable.value = data.retryable === true;
    buildInfoRetrying.value = false;
  }

  function showBuildInfoFailure(message: string): void {
    buildCoins.value = [];
    buildEmptyReason.value = message;
    buildRetryable.value = false;
    buildInfoRetrying.value = false;
  }

  function scheduleBuildInfoRetry(generation: number, attempt: number): void {
    if (buildInfoRetryTimer || generation !== initGeneration) return;
    if (attempt >= BUILD_INFO_MAX_RETRIES) {
      buildRetryable.value = false;
      buildInfoRetrying.value = false;
      return;
    }
    buildInfoRetrying.value = true;
    buildRetryAttempt.value = attempt + 1;
    buildInfoRetryTimer = setTimeout(async () => {
      buildInfoRetryTimer = null;
      if (generation !== initGeneration) return;
      try {
        const data = await apiFetch<BuildOhlcvInfo>(apiUrl('/heatmap/build-ohlcv-info'));
        if (generation !== initGeneration) return;
        applyBuildInfo(data);
        if (!buildCoins.value.length && data.retryable === true) {
          scheduleBuildInfoRetry(generation, attempt + 1);
        }
      } catch (error) {
        if (generation !== initGeneration) return;
        if (isRetryableBuildInfoError(error)) scheduleBuildInfoRetry(generation, attempt + 1);
        else showBuildInfoFailure(error instanceof Error ? error.message : String(error));
      }
    }, BUILD_INFO_RETRY_DELAY_MS);
  }

  /* ── init with retry (:936-963) ── */

  async function doInit(attempt: number, generation: number): Promise<void> {
    initPhase.value = attempt === 0 ? 'loading' : 'retrying';
    initRetry.value = attempt;
    try {
      const [dlD, bD] = await Promise.all([
        apiFetch<L2bookDownloadInfo>(apiUrl('/heatmap/l2book-download-info')),
        apiFetch<BuildOhlcvInfo>(apiUrl('/heatmap/build-ohlcv-info')),
      ]);
      if (generation !== initGeneration) return;
      dlCoins.value = dlD.coins || [];
      dlHasCreds.value = Boolean(dlD.has_aws_creds);
      dlArchive.value = dlD.archive_range || { oldest_day: '', newest_day: '' };
      dlStartDate.value = fmtDayInput(dlArchive.value.oldest_day);
      dlEndDate.value = fmtDayInput(dlArchive.value.newest_day);
      applyBuildInfo(bD);
      initPhase.value = 'ready';
      if (!buildCoins.value.length && bD.retryable === true) {
        scheduleBuildInfoRetry(generation, 0);
      }
    } catch (error) {
      if (generation !== initGeneration) return;
      if (attempt < INIT_MAX_RETRIES) {
        initPhase.value = 'retrying';
        initRetry.value = attempt + 1;
        initRetryTimer = setTimeout(() => {
          initRetryTimer = null;
          void doInit(attempt + 1, generation);
        }, INIT_RETRY_DELAY_MS);
      } else {
        initPhase.value = 'failed';
      }
    }
  }

  function fmtDayInput(day: string): string {
    return day && day.length === 8 ? day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6, 8) : '';
  }

  function init(): void {
    initGeneration += 1;
    if (initRetryTimer) clearTimeout(initRetryTimer);
    if (buildInfoRetryTimer) clearTimeout(buildInfoRetryTimer);
    initRetryTimer = null;
    buildInfoRetryTimer = null;
    buildInfoRetrying.value = false;
    void doInit(0, initGeneration);
  }

  function dispose(): void {
    initGeneration += 1;
    if (initRetryTimer) clearTimeout(initRetryTimer);
    if (buildInfoRetryTimer) clearTimeout(buildInfoRetryTimer);
    initRetryTimer = null;
    buildInfoRetryTimer = null;
    buildInfoRetrying.value = false;
  }

  /* ── picker view models (:1102-1107, :1193-1202, ordering :1164-1169) ── */

  const dlVisibleCoins = computed(() => downloadVisibleCoins(dlCoins.value, dlFilter.value));
  const dlRenderedCoins = computed(() => sortPickerCoins(dlVisibleCoins.value, dlSelected.value));

  const buildVisibleList = computed(() =>
    buildVisibleCoins({
      coins: buildCoins.value,
      coinsWithDownloadedHistory: buildCoinsWithDownloadedHistory.value,
      filter: buildFilter.value,
      tradfiOnly: buildTradfiOnly.value,
      noLocalData: buildNoLocalData.value,
    })
  );
  const buildRenderedCoins = computed(() => sortPickerCoins(buildVisibleList.value, buildSelected.value));

  function setDlSelected(coin: string, selected: boolean): void {
    const next = new Set(dlSelected.value);
    if (selected) next.add(coin);
    else next.delete(coin);
    dlSelected.value = next;
  }

  function setBuildSelected(coin: string, selected: boolean): void {
    const next = new Set(buildSelected.value);
    if (selected) next.add(coin);
    else next.delete(coin);
    buildSelected.value = next;
  }

  function dlSelectVisible(): void {
    const next = new Set(dlSelected.value);
    dlVisibleCoins.value.forEach((coin) => next.add(coin));
    dlSelected.value = next;
  }

  function dlClearSelection(): void {
    dlSelected.value = new Set();
  }

  function buildSelectVisible(): void {
    const next = new Set(buildSelected.value);
    buildVisibleList.value.forEach((coin) => next.add(coin));
    buildSelected.value = next;
  }

  function buildClearSelection(): void {
    buildSelected.value = new Set();
  }

  function toggleTradfiOnly(): void {
    buildTradfiOnly.value = !buildTradfiOnly.value;
  }

  function toggleNoLocalData(): void {
    buildNoLocalData.value = !buildNoLocalData.value;
  }

  /* ── messages (:1594-1612) ── */

  function showMsg(ns: SectionNs, kind: 'success' | 'warning' | 'error', text: string): void {
    (ns === 'dl' ? dlMessage : buildMessage).value = { kind, text };
  }

  function hideMsg(ns: SectionNs): void {
    (ns === 'dl' ? dlMessage : buildMessage).value = null;
  }

  /* ── build date order (:1301-1319) ── */

  function ensureBuildDateOrder(changed: 'start' | 'end', silent = false): boolean {
    const startMs = buildDateValueToMs(buildStartDate.value);
    const endMs = buildDateValueToMs(buildEndDate.value);
    if (startMs === null || endMs === null || endMs >= startMs) return true;
    if (changed === 'start') {
      buildEndDate.value = buildStartDate.value;
    } else {
      buildStartDate.value = buildEndDate.value;
    }
    if (!silent) showMsg('build', 'warning', t('market.endBeforeStart'));
    return false;
  }

  /* ── submit (:1555-1592) ── */

  async function submitDownload(): Promise<void> {
    const sd = inputToDay(dlStartDate.value);
    const ed = inputToDay(dlEndDate.value);
    if (!sd || !ed) {
      showMsg('dl', 'error', t('market.datesRequired'));
      return;
    }
    if (ed < sd) {
      showMsg('dl', 'error', t('market.endAfterStart'));
      return;
    }
    dlBusy.value = true;
    hideMsg('dl');
    try {
      const data = (await apiFetch<QueueReply>(apiUrl('/heatmap/queue-l2book-download-bulk'), {
        method: 'POST',
        body: JSON.stringify({
          coins: queueCoinsParam(dlSelected.value, dlCoins.value),
          start_day: sd,
          end_day: ed,
          only_missing_1m_src_hours: dlOnlyMissing.value,
        }),
      })) as QueueReply;
      if (data.error) showMsg('dl', 'error', data.error);
      else dlMessage.value = { kind: 'success', text: '', parts: buildQueuedMessageParts('dl', data, t) };
    } catch (e) {
      showMsg('dl', 'error', t('market.requestFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      dlBusy.value = false;
    }
  }

  async function submitBuild(): Promise<void> {
    buildBusy.value = true;
    hideMsg('build');
    try {
      const sd = inputToDay(buildStartDate.value);
      const ed = inputToDay(buildEndDate.value);
      if (sd && ed && ed < sd) {
        showMsg('build', 'error', t('market.startOnOrBeforeEnd'));
        return;
      }
      const data = (await apiFetch<QueueReply>(apiUrl('/heatmap/queue-build-ohlcv'), {
        method: 'POST',
        body: JSON.stringify({
          coins: queueCoinsParam(buildSelected.value, buildCoins.value),
          start_day: sd,
          end_day: ed,
          refetch: buildRefetch.value,
        }),
      })) as QueueReply;
      if (data.error) showMsg('build', 'error', data.error);
      else buildMessage.value = { kind: 'success', text: '', parts: buildQueuedMessageParts('build', data, t) };
    } catch (e) {
      showMsg('build', 'error', t('market.requestFailed', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      buildBusy.value = false;
    }
  }

  return {
    initPhase,
    initRetry,
    init,
    dlCoins,
    dlSelected,
    dlFilter,
    dlHasCreds,
    dlArchive,
    dlStartDate,
    dlEndDate,
    dlOnlyMissing,
    dlMessage,
    dlBusy,
    dlVisibleCoins,
    dlRenderedCoins,
    buildCoins,
    buildSelected,
    buildFilter,
    buildTradfiOnly,
    buildNoLocalData,
    buildCoinsWithDownloadedHistory,
    buildEmptyReason,
    buildRetryable,
    buildInfoRetrying,
    buildRetryAttempt,
    buildStartDate,
    buildEndDate,
    buildRefetch,
    buildMessage,
    buildBusy,
    buildVisibleList,
    buildRenderedCoins,
    setDlSelected,
    setBuildSelected,
    dlSelectVisible,
    dlClearSelection,
    buildSelectVisible,
    buildClearSelection,
    toggleTradfiOnly,
    toggleNoLocalData,
    submitDownload,
    submitBuild,
    ensureBuildDateOrder,
    dispose,
  };
}
