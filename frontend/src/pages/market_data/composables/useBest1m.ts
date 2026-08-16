/*
 * M-data-7 — the best-1m store: legacy best1mState (:3739-3750) plus the
 * panel action core (market_data_main.html :7447-7812):
 *
 *   mountHyperliquidDataActions :7577-7586  iframe src w/ change/force rule
 *   renderBest1mGeneric         :7588-7632  payload → state (selection
 *                                          pruning, exchange-change reset,
 *                                          host pruning, feedback)
 *   loadBest1mInfo              :7634-7660  loading UI + requestId staleness
 *   refreshBest1mPanel          :7662-7685  hyperliquid iframe vs generic
 *   openBest1mPanel queue slice :7693-7699  hyperliquid → reopen iframe
 *   queueBest1mGeneric          :7693-7740  POST /best-1m/queue/{exchange}
 *   picker view models          :7135-7256  selected-first ordering, host
 *                                          rows, summaries
 *
 * The form fields (dates/refetch/coin filter) move from the DOM into refs —
 * they were read at queue time (:7701-7704) and the port keeps that exact
 * collection point.
 *
 * NOT PORTED (documented legacy bug): loadBest1mInfo's error path wrote
 * #best1m-description (:7657), an element that does not exist in the DOM —
 * the assignment threw. The port renders the failure feedback + the
 * "unavailable" coin count and skips the phantom element.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { getExchangeMeta } from '../lib/exchange';
import {
  buildBest1mJobMonitorUrl,
  hyperliquidDataActionsPath,
  inputDayToBest1m,
  resolveJobMonitorSrc,
} from '../lib/best1mUrls';
import type { ShowToastFn, TranslateFn } from './useSettings';

/** One /best-1m/info payload (server shape). */
export interface Best1mInfoPayload {
  exchange?: unknown;
  coins?: unknown;
  hint?: unknown;
  refetch_label?: unknown;
  distributed_hosts?: unknown;
  empty_message?: unknown;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

/** One distributed downloader host (:7246-7253). */
export interface Best1mDistributedHost {
  hostname?: unknown;
  target?: unknown;
  label?: unknown;
  [key: string]: unknown;
}

export interface Best1mApi {
  fetchJson<T = unknown>(path: string, init?: RequestInit): Promise<T>;
}

export interface UseBest1mOptions {
  api: Best1mApi;
  t: TranslateFn;
  showToast: ShowToastFn;
  /** uiState.contextExchange (:7594, :7663, :7694). */
  getExchange(): string;
  /** uiState.best1mPanelSection (:7671). */
  getBest1mSection(): string;
  /** openBest1mPanel('build') (:7696) — App owns the section+panel switch. */
  openBest1mPanel(mode: 'build' | 'download'): void;
  /** PBGUI_SERIAL via boot (:4189). */
  serial(): string;
  /** config.marketDataApiBase-bound absolute-URL builder (:7581). */
  dataActionsUrl(path: string): string;
}

export type Best1mFeedback = { message: string; level: 'info' | 'warning' | 'error' } | null;

export interface Best1mHostRow {
  hostname: string;
  target: string;
  selected: boolean;
}

export interface UseBest1m {
  /* state */
  exchange: Ref<string>;
  enabledCoins: Ref<string[]>;
  coinFilter: Ref<string>;
  selectedCoins: Ref<Set<string>>;
  distributedHosts: Ref<Best1mDistributedHost[]>;
  selectedDistributedHosts: Ref<Set<string>>;
  distributedEnabled: Ref<boolean>;
  startDate: Ref<string>;
  endDate: Ref<string>;
  refetch: Ref<boolean>;
  hint: Ref<string>;
  refetchLabel: Ref<string>;
  feedback: Ref<Best1mFeedback>;
  isLoading: Ref<boolean>;
  loadFailed: Ref<boolean>;
  isQueueDisabled: ComputedRef<boolean>;
  isHyperliquid: ComputedRef<boolean>;
  jobMonitorVisible: ComputedRef<boolean>;
  hyperliquidSrc: Ref<string>;
  /** Bumped on forced hyperliquid remounts (bind as the iframe :key). */
  hyperliquidFrameKey: Ref<number>;
  jobMonitorSrc: Ref<string>;
  /* view models */
  visibleCoins: ComputedRef<string[]>;
  renderedCoins: ComputedRef<string[]>;
  hostRows: ComputedRef<Best1mHostRow[]>;
  selectedDistributedHostList: ComputedRef<Best1mDistributedHost[]>;
  /* actions */
  refreshPanel(forceReload: boolean): void;
  mountHyperliquid(section: unknown, forceReload: boolean): void;
  mountJobMonitor(exchangeKey: string, forceReload: boolean): void;
  loadInfo(exchange: string): Promise<void>;
  queueBest1m(): Promise<void>;
  setCoinFilter(value: string): void;
  isCoinSelected(coin: string): boolean;
  setCoinSelected(coin: string, selected: boolean): void;
  setSelectedCoins(values: string[]): void;
  selectVisibleCoins(): void;
  clearAllCoins(): void;
  toggleDistributedHost(hostname: string): void;
  setDistributedEnabled(enabled: boolean): void;
  setStartDate(value: string): void;
  setEndDate(value: string): void;
  setRefetch(value: boolean): void;
  setFeedback(message: string, level: 'info' | 'warning' | 'error'): void;
}

export function useBest1m(options: UseBest1mOptions): UseBest1m {
  const t = options.t;

  /* legacy best1mState (:3739-3750) + uiState.best1mRequestId (:3798) */
  const exchange = ref('');
  const enabledCoins = ref<string[]>([]);
  const coinFilter = ref('');
  const selectedCoins = ref<Set<string>>(new Set());
  const distributedHosts = ref<Best1mDistributedHost[]>([]);
  const selectedDistributedHosts = ref<Set<string>>(new Set());
  const distributedEnabled = ref(false);
  const startDate = ref('');
  const endDate = ref('');
  const refetch = ref(false);
  const hint = ref('');
  const refetchLabel = ref('');
  const feedback = ref<Best1mFeedback>(null);
  const isLoading = ref(false);
  const loadFailed = ref(false);
  const hyperliquidSrc = ref('');
  const hyperliquidFrameKey = ref(0); // forced reloads — legacy reassigned
  // frame.src directly (:7583-7584); Vue needs a key bump to remount
  const jobMonitorSrc = ref('');
  let requestId = 0;
  let queueing = false;

  const isHyperliquid = computed(() => getExchangeMeta(options.getExchange()).key === 'hyperliquid');
  const jobMonitorVisible = computed(() => jobMonitorSrc.value !== '');
  const isQueueDisabled = computed(() => !enabledCoins.value.length || isLoading.value || queueing);

  /* ── feedback (:5004-5021) ── */

  function setFeedback(message: string, level: 'info' | 'warning' | 'error'): void {
    const text = String(message ?? '').trim();
    feedback.value = text ? { message: text, level } : null;
  }

  /* ── iframe mounts (:7577-7586, :4197-4213) ── */

  function mountHyperliquid(section: unknown, forceReload: boolean): void {
    const next = options.dataActionsUrl(hyperliquidDataActionsPath(section)); // :7581
    if (hyperliquidSrc.value !== next) hyperliquidSrc.value = next; // :7582-7585
    if (forceReload === true) hyperliquidFrameKey.value += 1; // direct src reassignment
  }

  function mountJobMonitor(exchangeKey: string, forceReload: boolean): void {
    const next = buildBest1mJobMonitorUrl({
      exchangeKey,
      serial: options.serial(),
      forceReload: forceReload === true,
    });
    if (!next) {
      jobMonitorSrc.value = ''; // :4202-4206 — no meta → card hidden
      return;
    }
    const resolved = resolveJobMonitorSrc(jobMonitorSrc.value, next, forceReload === true);
    if (resolved !== null) jobMonitorSrc.value = resolved; // :4209-4212
  }

  /* ── coin selection (:7135-7302) ── */

  function selectedList(): string[] {
    const selectedSet = selectedCoins.value;
    return enabledCoins.value.filter((coin) => selectedSet.has(coin)); // :7137-7139
  }

  function isCoinSelected(coin: string): boolean {
    return selectedCoins.value.has(coin);
  }

  function setCoinSelected(coin: string, selected: boolean): void {
    const next = new Set(selectedCoins.value);
    if (selected) next.add(coin);
    else next.delete(coin);
    selectedCoins.value = next;
  }

  /** setBest1mSelectedCoins (:7142-7146) — filters to the enabled set. */
  function setSelectedCoins(values: string[]): void {
    const enabledSet = new Set(enabledCoins.value);
    selectedCoins.value = new Set(
      (Array.isArray(values) ? values : []).filter((coin) => enabledSet.has(coin))
    );
  }

  const visibleCoins = computed(() => {
    const filter = coinFilter.value.trim().toLowerCase(); // :7151
    return enabledCoins.value.filter(
      (coin) => !filter || coin.toLowerCase().includes(filter) // :7153
    );
  });

  /** renderBest1mCoinPicker ordering (:7193-7198) — selected first, then locale. */
  const renderedCoins = computed(() => {
    const selectedSet = selectedCoins.value;
    return [...visibleCoins.value].sort((left, right) => {
      const leftRank = selectedSet.has(left) ? 0 : 1;
      const rightRank = selectedSet.has(right) ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.localeCompare(right);
    });
  });

  /** btn-best1m-select-visible (:9314-9319) — union, sorted. */
  function selectVisibleCoins(): void {
    const next = new Set(selectedList());
    visibleCoins.value.forEach((coin) => next.add(coin));
    setSelectedCoins([...next].sort());
  }

  /** btn-best1m-clear-selection (:9321-9322). */
  function clearAllCoins(): void {
    setSelectedCoins([]);
  }

  function setCoinFilter(value: string): void {
    coinFilter.value = String(value ?? ''); // :9294
  }

  /* ── distributed hosts (:7215-7256, :9324-9346) ── */

  /** getBest1mSelectedDistributedHosts (:7215-7220). */
  const selectedDistributedHostList = computed(() => {
    const selectedSet = selectedDistributedHosts.value;
    return distributedHosts.value.filter((host) => selectedSet.has(String(host.hostname ?? '')));
  });

  /** renderBest1mDistributedHosts rows (:7246-7254). */
  const hostRows = computed<Best1mHostRow[]>(() => {
    const selectedSet = selectedDistributedHosts.value;
    return distributedHosts.value.map((host) => ({
      hostname: String(host.hostname ?? ''),
      target: String(host.target || host.label || ''),
      selected: selectedSet.has(String(host.hostname ?? '')),
    }));
  });

  function toggleDistributedHost(hostname: string): void {
    if (!hostname) return; // :9330-9331
    const next = new Set(selectedDistributedHosts.value);
    if (next.has(hostname)) next.delete(hostname);
    else next.add(hostname);
    selectedDistributedHosts.value = next; // :9332-9336
  }

  function setDistributedEnabled(enabled: boolean): void {
    distributedEnabled.value = Boolean(enabled); // :9324-9326
  }

  /* ── info load (:7588-7660) ── */

  /** renderBest1mGeneric (:7588-7632) as a state transition. */
  function applyInfoPayload(payload: Best1mInfoPayload): void {
    const coins = Array.isArray(payload?.coins) ? (payload.coins as string[]) : [];
    const exchangeKey = String(payload?.exchange || options.getExchange() || '');
    const exchangeChanged = exchange.value !== exchangeKey; // :7595
    const previousSelected = exchangeChanged ? [] : selectedList(); // :7596
    const enabledSet = new Set(coins);
    const nextSelected = previousSelected.filter((coin) => enabledSet.has(coin)); // :7598-7600

    hint.value = String(payload?.hint ?? ''); // :7602
    refetchLabel.value = String(payload?.refetch_label ?? ''); // :7603 (fallback at render)

    exchange.value = exchangeKey;
    enabledCoins.value = [...coins];
    distributedHosts.value = Array.isArray(payload?.distributed_hosts)
      ? [...(payload.distributed_hosts as Best1mDistributedHost[])]
      : []; // :7606-7607
    if (exchangeChanged) {
      coinFilter.value = ''; // :7609
      distributedEnabled.value = false; // :7610
      selectedDistributedHosts.value = new Set(); // :7611
    }
    const validHostnames = new Set(
      distributedHosts.value.map((host) => String(host.hostname ?? ''))
    ); // :7614-7616
    selectedDistributedHosts.value = new Set(
      [...selectedDistributedHosts.value].filter((hostname) => validHostnames.has(hostname))
    ); // :7617-7619

    selectedCoins.value = new Set(nextSelected); // :7621
    loadFailed.value = false;

    if (!coins.length) {
      setFeedback(String(payload?.empty_message ?? '') || t('market.noAvailableCoins'), 'warning'); // :7628
    } else {
      setFeedback('', 'info'); // clearBest1mFeedback :7630
    }
  }

  /** loadBest1mInfo (:7634-7660). */
  async function loadInfo(exchangeKey: string): Promise<void> {
    requestId += 1; // :7635-7636
    const currentRequest = requestId;
    setFeedback('', 'info'); // :7637
    hint.value = ''; // :7638
    isLoading.value = true;
    loadFailed.value = false;
    distributedHosts.value = []; // :7643
    try {
      const payload = (await options.api.fetchJson(
        `/best-1m/info/${encodeURIComponent(exchangeKey)}`
      )) as Best1mInfoPayload | null; // :7648
      if (currentRequest !== requestId) return; // :7649
      if (!payload || payload.success === false) {
        throw new Error(payload?.error || t('market.failedLoadBest1m')); // :7650-7651
      }
      applyInfoPayload(payload);
    } catch (error) {
      if (currentRequest !== requestId) return; // :7655
      setFeedback(
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedLoadBest1m'),
        'error'
      ); // :7656
      loadFailed.value = true; // :7658 — coin count "unavailable"
    } finally {
      if (currentRequest === requestId) isLoading.value = false;
    }
  }

  /* ── queue (:7693-7740) ── */

  async function queueBest1m(): Promise<void> {
    const meta = getExchangeMeta(options.getExchange()); // :7694
    if (meta.key === 'hyperliquid') {
      options.openBest1mPanel('build'); // :7695-7697
      return;
    }

    const startDay = inputDayToBest1m(startDate.value); // :7701
    const endDay = inputDayToBest1m(endDate.value); // :7702
    const selectedCoinsList = selectedList(); // :7703
    const distributedEnabledForRun =
      meta.key === 'bitget' && distributedEnabled.value; // :7704
    const distributedHostList = distributedEnabledForRun ? selectedDistributedHostList.value : []; // :7705
    if (distributedEnabledForRun && !distributedHostList.length) {
      const hostMessage = t('market.selectDownloader'); // :7707
      setFeedback(hostMessage, 'error');
      options.showToast(hostMessage, 'error');
      return;
    }

    queueing = true; // :7713
    setFeedback('', 'info'); // :7714
    try {
      const result = (await options.api.fetchJson(`/best-1m/queue/${encodeURIComponent(meta.key)}`, {
        method: 'POST',
        body: JSON.stringify({
          coins: selectedCoinsList,
          start_day: startDay,
          end_day: endDay,
          refetch: refetch.value, // :7722
          distributed: distributedEnabledForRun,
          distributed_hosts: distributedHostList.map((host) => host.hostname), // :7724
        }),
      })) as { success?: boolean; error?: string; message?: string; job_id?: unknown } | null;
      if (!result || result.success === false) {
        throw new Error(result?.error || t('market.failedQueueBest1m')); // :7727-7728
      }
      const message =
        result.message || t('market.queuedBest1m', { id: result.job_id }); // :7730
      setFeedback(message, 'info');
      options.showToast(message, 'success');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedQueueBest1m'); // :7734
      setFeedback(message, 'error');
      options.showToast(message, 'error');
    } finally {
      queueing = false; // :7738
    }
  }

  /* ── panel refresh (:7662-7685) ── */

  function refreshPanel(forceReload: boolean): void {
    const meta = getExchangeMeta(options.getExchange()); // :7663
    if (meta.key === 'hyperliquid') {
      const panelSection = options.getBest1mSection() === 'download' ? 'download' : 'build'; // :7671
      setFeedback('', 'info'); // :7675 clearBest1mFeedback
      mountHyperliquid(panelSection, forceReload === true); // :7676
      return;
    }
    mountJobMonitor(meta.key, forceReload === true); // :7683
    void loadInfo(meta.key); // :7684
  }

  function setStartDate(value: string): void {
    startDate.value = String(value ?? '');
  }

  function setEndDate(value: string): void {
    endDate.value = String(value ?? '');
  }

  function setRefetch(value: boolean): void {
    refetch.value = Boolean(value);
  }

  return {
    exchange,
    enabledCoins,
    coinFilter,
    selectedCoins,
    distributedHosts,
    selectedDistributedHosts,
    distributedEnabled,
    startDate,
    endDate,
    refetch,
    hint,
    refetchLabel,
    feedback,
    isLoading,
    loadFailed,
    isQueueDisabled,
    isHyperliquid,
    jobMonitorVisible,
    hyperliquidSrc,
    hyperliquidFrameKey,
    jobMonitorSrc,
    visibleCoins,
    renderedCoins,
    hostRows,
    selectedDistributedHostList,
    refreshPanel,
    mountHyperliquid,
    mountJobMonitor,
    loadInfo,
    queueBest1m,
    setCoinFilter,
    isCoinSelected,
    setCoinSelected,
    setSelectedCoins,
    selectVisibleCoins,
    clearAllCoins,
    toggleDistributedHost,
    setDistributedEnabled,
    setStartDate,
    setEndDate,
    setRefetch,
    setFeedback,
  };
}
