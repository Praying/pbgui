/*
 * The Coin Data page store — the reactive port of the legacy
 * coin_data.html script (:1713-3180): filters + drafts (:1719-1731), UI
 * state (:1713-1717), sort state (:1739-1743), URL/localStorage persistence
 * (:1971-2027), /state loading with abort+sequence guards (:2126-2182),
 * exchange-specific normalization (:2085-2110), hip3 dex filtering
 * (:2328-2348), row sorting (:2581-2595) and the selected-row view model
 * (:2718-2728).
 *
 * Refresh jobs live in useRefreshJobs (legacy :2184-2262); this store owns
 * applyServerState (:2137-2158), shared by both paths.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { apiUrl } from '../config';
import { getDynamicVolMcapStepValue, parseFilterNumber, formatStepperValue, isIncompleteFilterNumber, commitFilterNumberDraft, stepFixedValue } from '../lib/filters';
import { rowKey } from '../lib/format';
import type {
  CoinDataMainRow,
  CoinDataHip3Row,
  CoinDataRefreshJob,
  CoinDataState,
  CoinDataUnmatchedRow,
  SortState,
  TableViewName,
} from '../types';

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

const UI_STORAGE_KEY = 'coin-data-ui-state'; // getUiStorageKey :1971-1973
const FILTER_DEBOUNCE_MS = 220; // scheduleFilterReload :2569-2574

export type NumberFilterKey = 'market_cap' | 'vol_mcap';

export interface UseCoinDataState {
  /* state */
  filters: Ref<{
    exchange: string;
    hip3Dex: string;
    marketCap: number;
    volMcap: number;
    tags: string[];
    onlyCpt: boolean;
  }>;
  marketCapDraft: Ref<string | null>;
  volMcapDraft: Ref<string | null>;
  serverState: Ref<CoinDataState | null>;
  activeView: Ref<TableViewName>;
  selectedKey: Ref<string>;
  selectedTable: Ref<TableViewName>;
  sortStates: Ref<Record<TableViewName, SortState>>;
  actionStatus: Ref<{ message: string; isError: boolean }>;
  isLoading: Ref<boolean>;
  /* exchange capabilities (:2085-2092) */
  supportsHip3: ComputedRef<boolean>;
  supportsCopyTradingFilter: ComputedRef<boolean>;
  /* CMC gating (renderSidebarMeta :2283-2291) */
  hasMaterializedCmcKey: ComputedRef<boolean>;
  cmcDisabledReason: ComputedRef<string>;
  /* view models */
  sortedMainRows: ComputedRef<CoinDataMainRow[]>;
  sortedUnmatchedRows: ComputedRef<CoinDataUnmatchedRow[]>;
  hip3DexOptions: ComputedRef<string[]>;
  filteredHip3Rows: ComputedRef<CoinDataHip3Row[]>;
  sortedHip3Rows: ComputedRef<CoinDataHip3Row[]>;
  selectedRow: ComputedRef<CoinDataMainRow | CoinDataHip3Row | CoinDataUnmatchedRow | null>;
  hip3VisibleCount: ComputedRef<number>;
  currentCount: ComputedRef<number>;
  /* actions */
  loadState(): Promise<void>;
  applyServerState(next: CoinDataState): void;
  setExchange(exchange: string): void;
  setHip3Dex(dex: string): void;
  setTags(tags: string[]): void;
  toggleOnlyCpt(): void;
  resetFilters(): void;
  setActiveView(view: TableViewName): void;
  selectRow(table: TableViewName, key: string): void;
  closeSelectedDetails(): void;
  handleSortClick(table: TableViewName, key: string): void;
  onNumberInput(key: NumberFilterKey, rawValue: string): boolean;
  onNumberChange(key: NumberFilterKey): void;
  stepNumberFilter(key: NumberFilterKey, direction: number): void;
  setActionStatus(message: string, isError: boolean): void;
}

export function useCoinDataState(options: { t: TranslateFn }): UseCoinDataState {
  const t = options.t;

  const filters = ref<{
    exchange: string;
    hip3Dex: string;
    marketCap: number;
    volMcap: number;
    tags: string[];
    onlyCpt: boolean;
  }>({
    exchange: '',
    hip3Dex: '',
    marketCap: 0,
    volMcap: 10, // :1723
    tags: [],
    onlyCpt: false,
  });
  const marketCapDraft = ref<string | null>(null); // filterDrafts :1727-1730
  const volMcapDraft = ref<string | null>(null);
  const serverState = ref<CoinDataState | null>(null);
  const activeView = ref<TableViewName>('main');
  const selectedKey = ref('');
  const selectedTable = ref<TableViewName>('main');
  const sortStates = ref<Record<TableViewName, SortState>>({
    main: { key: 'market_cap', dir: 'desc' },
    unmatched: { key: 'coin', dir: 'asc' },
    hip3: { key: 'volume_24h', dir: 'desc' },
  }); // :1739-1743
  const actionStatus = ref({ message: '', isError: false });
  const isLoading = ref(false);

  let requestSeq = 0; // loadStateRequestSeq :1735
  let abortController: AbortController | null = null; // loadStateController :1736
  let debounceTimer: ReturnType<typeof setTimeout> | null = null; // :1734

  /* ── exchange capabilities (:2085-2092) ── */

  const supportsHip3 = computed(() => filters.value.exchange.toLowerCase() === 'hyperliquid');
  const supportsCopyTradingFilter = computed(() => {
    const exchange = filters.value.exchange.toLowerCase();
    return exchange === 'binance' || exchange === 'bitget' || exchange === 'bybit';
  });

  /** normalizeExchangeSpecificState (:2094-2110). */
  function normalizeExchangeSpecificState(exchange: string): void {
    const hip3 = exchange.toLowerCase() === 'hyperliquid';
    const cpt = ['binance', 'bitget', 'bybit'].includes(exchange.toLowerCase());
    if (!hip3 && activeView.value === 'hip3') {
      activeView.value = 'main';
      selectedTable.value = 'main';
      selectedKey.value = '';
    }
    if (!hip3) filters.value.hip3Dex = '';
    if (!cpt) filters.value.onlyCpt = false;
    if (selectedTable.value === 'hip3' && !hip3) {
      selectedTable.value = 'main';
      selectedKey.value = '';
    }
  }

  /* ── persistence (:1971-2027) ── */

  function loadUiState(): void {
    try {
      const raw = localStorage.getItem(UI_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.activeView === 'main' || parsed.activeView === 'unmatched' || parsed.activeView === 'hip3') {
          activeView.value = parsed.activeView;
          selectedTable.value = parsed.activeView;
        }
      }
    } catch {
      /* legacy warned and moved on */
    }
  }

  function saveUiState(): void {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ activeView: activeView.value }));
    } catch {
      /* ignore */
    }
  }

  function loadFiltersFromQuery(): void {
    const params = new URLSearchParams(window.location.search);
    const exchange = params.get('exchange');
    const hip3Dex = params.get('hip3_dex');
    const marketCap = params.get('market_cap');
    const volMcap = params.get('vol_mcap');
    const tags = params.get('tags');
    if (exchange) filters.value.exchange = exchange;
    if (hip3Dex) filters.value.hip3Dex = hip3Dex;
    if (marketCap) filters.value.marketCap = Number(marketCap) || 0;
    if (volMcap) filters.value.volMcap = Number(volMcap) || 0;
    if (params.get('only_cpt') === '1') filters.value.onlyCpt = true;
    if (tags) {
      filters.value.tags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
  }

  function saveFiltersToQuery(): void {
    const params = new URLSearchParams(window.location.search);
    params.set('exchange', filters.value.exchange || '');
    if (filters.value.hip3Dex) params.set('hip3_dex', filters.value.hip3Dex);
    else params.delete('hip3_dex');
    params.set('market_cap', String(filters.value.marketCap || 0));
    params.set('vol_mcap', String(filters.value.volMcap || 0));
    if (filters.value.tags.length) params.set('tags', filters.value.tags.join(','));
    else params.delete('tags');
    if (filters.value.onlyCpt) params.set('only_cpt', '1');
    else params.delete('only_cpt');
    const nextUrl = window.location.pathname + '?' + params.toString();
    window.history.replaceState({}, '', nextUrl);
  }

  /* ── /state loading (:2126-2182) ── */

  /** buildStateUrl (:2126-2135) — cookie-session fetch, no Bearer header. */
  function buildStateUrl(): string {
    const params = new URLSearchParams();
    if (filters.value.exchange) params.set('exchange', filters.value.exchange);
    params.set('market_cap', String(filters.value.marketCap || 0));
    params.set('vol_mcap', String(filters.value.volMcap || 0));
    if (filters.value.onlyCpt && supportsCopyTradingFilter.value) params.set('only_cpt', 'true');
    filters.value.tags.forEach((tag) => params.append('tags', tag));
    return apiUrl('/state?' + params.toString());
  }

  function setActionStatus(message: string, isError: boolean): void {
    actionStatus.value = { message: message || t('market.ready'), isError }; // :2073-2078
  }

  async function loadState(): Promise<void> {
    const seq = ++requestSeq;
    abortController?.abort();
    abortController = new AbortController();
    setActionStatus(t('market.loadingCoinData'), false);
    isLoading.value = true;
    try {
      const response = await fetch(buildStateUrl(), {
        cache: 'no-store',
        signal: abortController.signal,
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = (await response.json()) as CoinDataState;
      if (seq !== requestSeq) return;
      applyServerState(data);
      const pool = data.cmc_pool || {};
      const reason = pool.error || pool.reason || t('market.noCmcKey');
      setActionStatus(
        pool.ready ? t('market.ready') : reason + t('market.cachedCoinDataAvailable'),
        !pool.ready
      ); // :2173-2175
    } catch (error) {
      if (seq !== requestSeq || (error instanceof DOMException && error.name === 'AbortError')) return;
      const message = error instanceof Error ? error.message : String(error);
      setActionStatus(t('market.failedLoadCoinData', { message }), true); // :2179
    } finally {
      if (seq === requestSeq) isLoading.value = false;
    }
  }

  /** applyServerState (:2137-2158). */
  function applyServerState(next: CoinDataState): void {
    serverState.value = next;
    filters.value.exchange = next.filters.exchange;
    filters.value.marketCap = Number(next.filters.market_cap || 0);
    filters.value.volMcap = Number(next.filters.vol_mcap || 0);
    filters.value.tags = (next.filters.tags || []).slice();
    filters.value.onlyCpt = Boolean(next.filters.only_cpt);
    normalizeExchangeSpecificState(filters.value.exchange);
    if (selectedKey.value) {
      const allRows: Array<Record<string, unknown>> = [
        ...(next.rows || []) as unknown as Array<Record<string, unknown>>,
        ...(next.hip3_rows || []) as unknown as Array<Record<string, unknown>>,
        ...(next.unmatched_rows || []) as unknown as Array<Record<string, unknown>>,
      ];
      const exists = allRows.some((row) => rowKey(row, selectedTable.value) === selectedKey.value);
      if (!exists) {
        selectedKey.value = '';
        selectedTable.value = 'main';
      }
    }
    // drop a stale hip3 dex selection whose option vanished (renderHip3DexFilter :2365-2367)
    if (filters.value.hip3Dex && !hip3DexOptions.value.includes(filters.value.hip3Dex)) {
      filters.value.hip3Dex = '';
    }
    saveFiltersToQuery();
    saveUiState();
  }

  function scheduleFilterReload(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void loadState();
    }, FILTER_DEBOUNCE_MS);
  }

  function triggerFilterReloadNow(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    void loadState();
  }

  /* ── control handlers (:3098-3161) ── */

  function setExchange(exchange: string): void {
    filters.value.exchange = exchange;
    filters.value.hip3Dex = '';
    filters.value.tags = [];
    normalizeExchangeSpecificState(exchange);
    selectedKey.value = '';
    void loadState();
  }

  function setHip3Dex(dex: string): void {
    filters.value.hip3Dex = dex || '';
    selectedKey.value = '';
    saveFiltersToQuery();
  }

  function setTags(tags: string[]): void {
    filters.value.tags = tags;
    scheduleFilterReload();
  }

  function toggleOnlyCpt(): void {
    filters.value.onlyCpt = !filters.value.onlyCpt;
    void loadState();
  }

  function resetFilters(): void {
    filters.value.hip3Dex = '';
    filters.value.marketCap = 0;
    filters.value.volMcap = 10; // :2924
    marketCapDraft.value = null;
    volMcapDraft.value = null;
    filters.value.tags = [];
    filters.value.onlyCpt = false;
    void loadState();
  }

  function setActiveView(view: TableViewName): void {
    activeView.value = view;
    selectedKey.value = '';
    selectedTable.value = view;
    saveUiState();
  }

  function selectRow(table: TableViewName, key: string): void {
    selectedTable.value = table;
    selectedKey.value = key;
  }

  function closeSelectedDetails(): void {
    selectedKey.value = '';
    selectedTable.value = activeView.value;
  }

  /* ── number-filter drafts (:2402-2464) ── */

  function draftFor(key: NumberFilterKey): Ref<string | null> {
    return key === 'market_cap' ? marketCapDraft : volMcapDraft;
  }

  function filterValueFor(key: NumberFilterKey): number {
    return key === 'market_cap' ? filters.value.marketCap : filters.value.volMcap;
  }

  /** input handler (:3140-3156) — false keeps the incomplete draft without reloading. */
  function onNumberInput(key: NumberFilterKey, rawValue: string): boolean {
    const draft = draftFor(key);
    draft.value = rawValue == null ? '' : String(rawValue);
    if (rawValue == null || rawValue === '') {
      if (key === 'market_cap') filters.value.marketCap = 0;
      else filters.value.volMcap = 0;
      return true;
    }
    if (isIncompleteFilterNumber(rawValue)) {
      if (debounceTimer) clearTimeout(debounceTimer);
      return false;
    }
    const current = filterValueFor(key);
    const committed = commitFilterNumberDraft(rawValue, current, (value) => {
      if (key === 'market_cap') filters.value.marketCap = value;
      else filters.value.volMcap = value;
    });
    if (!committed) {
      if (debounceTimer) clearTimeout(debounceTimer);
      return false;
    }
    scheduleFilterReload();
    return true;
  }

  /** change handler (:3147-3150) — finalize the draft and reload now. */
  function onNumberChange(key: NumberFilterKey): void {
    const draft = draftFor(key);
    if (draft.value !== null && isIncompleteFilterNumber(draft.value)) {
      draft.value = String(filterValueFor(key) || 0); // finalizeFilterNumberDraft :2451-2453
    }
    triggerFilterReloadNow();
  }

  /** stepFilterField (:2502-2525). */
  function stepNumberFilter(key: NumberFilterKey, direction: number): void {
    const draft = draftFor(key);
    const currentText = draft.value !== null ? draft.value : String(filterValueFor(key) || 0);
    if (key === 'vol_mcap') {
      const current = parseFilterNumber(currentText, filters.value.volMcap);
      const next = getDynamicVolMcapStepValue(
        current,
        direction,
        serverState.value?.options?.vol_mcap_values || []
      );
      if (next == null) return;
      if (Math.abs(next - current) < 1e-12) return;
      applySteppedValue(key, formatStepperValue(next));
      return;
    }
    applySteppedValue(key, stepMarketCap(currentText, direction));
  }

  function stepMarketCap(currentText: string, direction: number): string {
    // input attrs (legacy :1490): min 0, step 250
    return String(stepFixedValue(currentText, 250, 0, Infinity, direction));
  }

  /** applyFilterNumberValue with reloadNow (:2456-2464). */
  function applySteppedValue(key: NumberFilterKey, formatted: string): void {
    const draft = draftFor(key);
    draft.value = formatted;
    const current = filterValueFor(key);
    const parsed = parseFilterNumber(formatted, current);
    if (key === 'market_cap') filters.value.marketCap = parsed;
    else filters.value.volMcap = parsed;
    triggerFilterReloadNow();
  }

  /* ── sorting (:2581-2595, :2891-2904) ── */

  function sortRows<T extends Record<string, unknown>>(rows: T[], table: TableViewName): T[] {
    const state = sortStates.value[table];
    const direction = state.dir === 'asc' ? 1 : -1;
    return rows.slice().sort((left, right) => {
      let lv: unknown = left[state.key];
      let rv: unknown = right[state.key];
      if (typeof lv === 'boolean') lv = lv ? 1 : 0;
      if (typeof rv === 'boolean') rv = rv ? 1 : 0;
      if (lv == null && rv == null) return 0;
      if (lv == null) return 1;
      if (rv == null) return -1;
      if (typeof lv === 'number' && typeof rv === 'number') return (lv - rv) * direction;
      return String(lv).localeCompare(String(rv)) * direction;
    });
  }

  function handleSortClick(table: TableViewName, key: string): void {
    const state = sortStates.value[table];
    if (state.key === key) {
      state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.key = key;
      state.dir = key === 'coin' || key === 'ccxt_symbol' ? 'asc' : 'desc'; // :2901
    }
  }

  const sortedMainRows = computed(() => sortRows(serverState.value?.rows || [], 'main'));
  const sortedUnmatchedRows = computed(() => sortRows(serverState.value?.unmatched_rows || [], 'unmatched'));

  /* ── hip3 (:2328-2348) ── */

  const hip3DexOptions = computed<string[]>(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    (serverState.value?.hip3_rows || []).forEach((row) => {
      const dex = String(row?.dex || '').trim();
      if (!dex || seen.has(dex)) return;
      seen.add(dex);
      options.push(dex);
    });
    return options.sort((left, right) => left.localeCompare(right));
  });

  const filteredHip3Rows = computed(() => {
    const rows = (serverState.value?.hip3_rows || []).slice();
    if (!filters.value.hip3Dex) return rows;
    return rows.filter((row) => String(row?.dex || '') === filters.value.hip3Dex);
  });

  const sortedHip3Rows = computed(() => sortRows(filteredHip3Rows.value, 'hip3'));
  const hip3VisibleCount = computed(() => filteredHip3Rows.value.length);

  /* ── selected row (:2718-2728) ── */

  const selectedRow = computed<CoinDataMainRow | CoinDataHip3Row | CoinDataUnmatchedRow | null>(() => {
    if (!selectedKey.value) return null;
    let rows: Array<Record<string, unknown>>;
    if (selectedTable.value === 'main') rows = serverState.value?.rows || [];
    else if (selectedTable.value === 'hip3') rows = filteredHip3Rows.value;
    else rows = serverState.value?.unmatched_rows || [];
    for (const row of rows) {
      if (rowKey(row, selectedTable.value) === selectedKey.value) {
        return row as CoinDataMainRow | CoinDataHip3Row | CoinDataUnmatchedRow;
      }
    }
    return null;
  });

  /* ── sidebar meta (:2278-2292) ── */

  const currentCount = computed(() => {
    const counts = serverState.value?.counts;
    if (!counts) return 0;
    if (activeView.value === 'unmatched') return counts.unmatched_visible || 0;
    if (activeView.value === 'hip3') return hip3VisibleCount.value;
    return counts.main || 0;
  });

  const hasMaterializedCmcKey = computed(() => {
    const pool = serverState.value?.cmc_pool || {};
    return pool.ready === true && Number(pool.active_credentials || 0) > 0; // :2284
  });

  const cmcDisabledReason = computed(() => {
    const pool = serverState.value?.cmc_pool || {};
    return String(pool.error || pool.reason || t('market.noCmcKey')); // :2285
  });

  /* ── bootstrap (:3174-3175) ── */

  loadUiState();
  loadFiltersFromQuery();

  return {
    filters,
    marketCapDraft,
    volMcapDraft,
    serverState,
    activeView,
    selectedKey,
    selectedTable,
    sortStates,
    actionStatus,
    isLoading,
    supportsHip3,
    supportsCopyTradingFilter,
    hasMaterializedCmcKey,
    cmcDisabledReason,
    sortedMainRows,
    sortedUnmatchedRows,
    hip3DexOptions,
    filteredHip3Rows,
    sortedHip3Rows,
    selectedRow,
    hip3VisibleCount,
    currentCount,
    loadState,
    applyServerState,
    setExchange,
    setHip3Dex,
    setTags,
    toggleOnlyCpt,
    resetFilters,
    setActiveView,
    selectRow,
    closeSelectedDetails,
    handleSortClick,
    onNumberInput,
    onNumberChange,
    stepNumberFilter,
    setActionStatus,
  };
}

/** Shape of the job payload useRefreshJobs polls (GET /refresh/jobs/{id}). */
export type { CoinDataRefreshJob };
