import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import {
  DEFAULT_CANONICAL_TYPES,
  DEFAULT_EDITOR_STATUSES,
  deriveTradfiOptionLists,
  filterTradfiRows,
  normalizeSelectValue,
  type TradfiFilters,
  type TradfiOptionLists,
  type TradfiRow,
} from '../lib/tradfiFilters';
import type { ToastLevel } from '../types';
import { useTradfiActions } from './useTradfiActions';

/*
 * The TradFi map controller — legacy tradfiMapState (:3764-3783) plus the
 * whole TradFi action core (market_data_main.html):
 *
 *   loadTradfiMappings       :6606-6627  GET map + stale guard
 *   renderTradfiMap          :6508-6604  applyMapPayload (options, prune,
 *                                        editor tail) — filter changes go
 *                                        through syncSelectionAndEditor
 *   applyTradfiPayload       :6629-6635  applyResultPayload
 *   search window flows      :6637-6736  searchTicker / runSearch /
 *                                        applySearchResult
 *   editor flows             :6412-6466, :6738-6752
 *   action endpoints         :6754-6975  split into useTradfiActions.ts: the
 *                                        uniform runAction envelope, the seven
 *                                        endpoint wrappers (test-resolve, start
 *                                        dates one/all, spec/metadata/price
 *                                        refresh, auto-map) and loadSpecsView —
 *                                        injected with this controller's state
 *                                        below and re-exported here
 *   saveTradfiMapping        :6977-7013
 *   renderTradfiActionResult :5747-5803  setActionResult normalization
 *   renderTradfiCacheNote    :6112-6119  cacheNote computed
 *   updateTradfiActionButtons:6388-6410  actionButtons computed
 *
 * The legacy non-hyperliquid tail (:7399-7401) is resetForOtherExchange,
 * invoked by App.vue through useSettings.onOtherExchangePayload. The
 * settingsState.exchange !== 'hyperliquid' gate of loadTradfiMappings
 * (:6607) lives at that call site — the only legacy caller (:7397) runs
 * inside the hyperliquid branch already.
 */

/** The single fetchJson slice this controller needs. */
export interface TradfiApi {
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
export type ShowToastFn = (message: unknown, level?: ToastLevel) => void;

/** GET/POST /settings/hyperliquid/tradfi-map payload (server-supplied). */
export interface TradfiMapPayload {
  rows?: unknown;
  type_values?: unknown;
  status_values?: unknown;
  canonical_types?: unknown;
  statuses?: unknown;
  selected_xyz_coin?: unknown;
  meta_cache_info?: { summary?: unknown } | null;
  quote_cache_info?: { summary?: unknown } | null;
  spec_cache_info?: { summary?: unknown } | null;
  [key: string]: unknown;
}

/** The uniform action-endpoint envelope. */
export interface TradfiActionResponse {
  success?: boolean;
  error?: string;
  message?: string;
  result?: Record<string, unknown>;
  payload?: TradfiMapPayload;
}

/** One Tiingo ticker-search hit (:942-952 backend shape). */
export interface TradfiSearchItem {
  ticker?: string;
  name?: string;
  asset_type?: string;
  is_active?: boolean;
  tiingo_price?: unknown;
  tiingo_price_timestamp?: unknown;
  tiingo_price_source?: unknown;
  [key: string]: unknown;
}

/** /tradfi-map/specs payload (build_xyz_spec_rows). */
export interface TradfiSpecsPayload {
  fetched_at?: string;
  rows?: unknown;
  [key: string]: unknown;
}

/** tradfi-editor field set (:6415-6423 defaults). */
export interface TradfiEditorFields {
  xyzCoin: string;
  canonicalType: string;
  status: string;
  description: string;
  tiingoTicker: string;
  tiingoFxTicker: string;
  tiingoStartDate: string;
  note: string;
  fxInvert: boolean;
}

/** renderTradfiActionResult normalized shape (:5762-5767). */
export interface TradfiActionResultGroup {
  label: string;
  count: number;
  items: string[];
}

export interface TradfiActionResult {
  level: 'success' | 'warn' | 'error';
  title: string;
  details: string[];
  groups: TradfiActionResultGroup[];
}

/** The editor-mode label inputs (:6427, :6461-6463). */
export type EditorModeKind = 'select' | 'saved' | 'json';

/** updateTradfiActionButtons ids (:6393-6404). */
export type TradfiActionButtonId =
  | 'searchTicker'
  | 'editSelected'
  | 'testResolve'
  | 'fetchStartDate'
  | 'specRefresh'
  | 'autoMap'
  | 'fetchAllStartDates'
  | 'refreshMetadata'
  | 'refreshPrices'
  | 'viewSpecs';

export type TradfiActionButtons = Record<TradfiActionButtonId, boolean>;

export interface UseTradfiMapOptions {
  api: TradfiApi;
  t: TranslateFn;
  showToast: ShowToastFn;
  /** Legacy isTiingoConfigured (:6390) — the Tiingo controller owns it. */
  isTiingoConfigured(): boolean;
}

export interface UseTradfiMap {
  rows: Ref<readonly TradfiRow[]>;
  filters: TradfiFilters;
  optionLists: Ref<TradfiOptionLists>;
  selectedCoin: Ref<string>;
  selectedRow: ComputedRef<TradfiRow | null>;
  filteredRows: ComputedRef<readonly TradfiRow[]>;
  loadError: Ref<string>;
  lastPayload: Ref<TradfiMapPayload | null>;
  cacheNote: ComputedRef<string>;
  countText: ComputedRef<string>;
  editorOpen: Ref<boolean>;
  editor: TradfiEditorFields;
  editorMode: Ref<{ kind: EditorModeKind; coin: string }>;
  xyzReadOnly: Ref<boolean>;
  actionButtons: ComputedRef<TradfiActionButtons>;
  windowMode: Ref<'' | 'search' | 'specs'>;
  searchResults: Ref<readonly TradfiSearchItem[]>;
  searchCoin: Ref<string>;
  searchQuery: Ref<string>;
  searchLoading: Ref<boolean>;
  searchMessage: Ref<string>;
  searchMessageLevel: Ref<string>;
  specsPayload: Ref<TradfiSpecsPayload | null>;
  specsLoadingMessage: Ref<string>;
  actionResult: Ref<TradfiActionResult | null>;
  /** True after the first successful renderTradfiMap (:6539 replaces the waiting note). */
  hasRendered: Ref<boolean>;

  loadMappings(): Promise<void>;
  applyResultPayload(result: TradfiActionResponse | null | undefined): void;
  setFilterSymbol(value: string): void;
  setFilterType(value: string): void;
  setFilterStatus(value: string): void;
  selectCoin(coin: string): void;
  syncEditor(row: TradfiRow | null, options?: { keepOpen?: boolean }): void;
  resetEditor(options: { keepOpen?: boolean; preserveSelection?: boolean }): void;
  editSelected(): void;
  cancelEditor(): void;
  saveMapping(): Promise<boolean>;
  searchTicker(): void;
  runSearch(query: string): Promise<void>;
  applySearchResult(index: number): Promise<void>;
  testResolve(): Promise<void>;
  fetchStartDate(): Promise<void>;
  fetchAllStartDates(): Promise<void>;
  refreshSpecs(): Promise<void>;
  autoMap(): Promise<void>;
  refreshMetadata(): Promise<void>;
  refreshPrices(): Promise<void>;
  loadSpecsView(): Promise<void>;
  closeWindow(): void;
  clearActionResult(): void;
  setActionResult(
    level: string | undefined,
    title: unknown,
    details?: unknown,
    groups?: unknown
  ): void;
  resetForOtherExchange(): void;
}

/** tradfiMapState.rows entries (:6509). */
function toRows(payloadRows: unknown): TradfiRow[] {
  return Array.isArray(payloadRows) ? (payloadRows as TradfiRow[]) : [];
}

function text(value: unknown): string {
  return String(value ?? '');
}

export function useTradfiMap(options: UseTradfiMapOptions): UseTradfiMap {
  const { api, t, showToast } = options;

  /* ── state (:3764-3783) ── */
  const rows = ref<readonly TradfiRow[]>([]);
  const filters = reactive<TradfiFilters>({ symbol: '', type: 'all', status: 'all' });
  const optionLists = ref<TradfiOptionLists>(
    deriveTradfiOptionLists(undefined, [])
  );
  const selectedCoin = ref('');
  const editorOpen = ref(false);
  const loadError = ref('');
  const lastPayload = ref<TradfiMapPayload | null>(null);
  const windowMode = ref<'' | 'search' | 'specs'>('');
  const searchResults = ref<readonly TradfiSearchItem[]>([]);
  const searchCoin = ref('');
  const searchQuery = ref('');
  const searchLoading = ref(false);
  const searchMessage = ref('');
  const searchMessageLevel = ref('info');
  const specsPayload = ref<TradfiSpecsPayload | null>(null);
  const specsLoadingMessage = ref('');
  const actionResult = ref<TradfiActionResult | null>(null);
  const hasRendered = ref(false);
  const editor = reactive<TradfiEditorFields>({
    xyzCoin: '',
    canonicalType: 'equity_us',
    status: 'pending',
    description: '',
    tiingoTicker: '',
    tiingoFxTicker: '',
    tiingoStartDate: '',
    note: '',
    fxInvert: false,
  });
  const editorMode = ref<{ kind: EditorModeKind; coin: string }>({ kind: 'select', coin: '' });
  const xyzReadOnly = ref(false);
  let requestId = 0; // :3773 — loadTradfiMappings generation counter

  /* ── derived ── */

  const filteredRows = computed<readonly TradfiRow[]>(() => filterTradfiRows(rows.value, filters));

  const selectedRow = computed<TradfiRow | null>(
    () => rows.value.find((row) => text(row.xyz_coin) === selectedCoin.value) ?? null // :5729-5733
  );

  /** renderTradfiCacheNote (:6112-6119). */
  const cacheNote = computed<string>(() => {
    const payload = lastPayload.value ?? {};
    const parts = [
      text(payload.meta_cache_info?.summary),
      text(payload.quote_cache_info?.summary),
      text(payload.spec_cache_info?.summary),
    ];
    return parts.filter(Boolean).join(' · ');
  });

  /** #tradfi-map-count (:6539-6542). */
  const countText = computed<string>(() =>
    t('market.visibleTotal', {
      visible: filteredRows.value.length,
      total: rows.value.length,
    })
  );

  /** updateTradfiActionButtons (:6388-6410) — disabled map. */
  const actionButtons = computed<TradfiActionButtons>(() => {
    const row = selectedRow.value;
    const hasApiKey = options.isTiingoConfigured();
    const selectedHasEquityTicker = Boolean(row && text(row.tiingo_ticker).trim());
    return {
      searchTicker: !row || !hasApiKey, // :6394
      editSelected: !row, // :6395
      testResolve: !row, // :6396
      fetchStartDate: !row || !hasApiKey || !selectedHasEquityTicker, // :6397
      specRefresh: false, // :6398
      autoMap: !hasApiKey, // :6399
      fetchAllStartDates: !hasApiKey, // :6400
      refreshMetadata: !hasApiKey, // :6401
      refreshPrices: !hasApiKey, // :6402
      viewSpecs: false, // :6403
    };
  });

  /* ── editor (:6412-6466) ── */

  /** resetTradfiEditor (:6412-6431). */
  function resetEditor(resetOptions: { keepOpen?: boolean; preserveSelection?: boolean }): void {
    if (!resetOptions.preserveSelection) selectedCoin.value = ''; // :6414
    editor.xyzCoin = ''; // :6415-6423
    editor.canonicalType = 'equity_us';
    editor.status = 'pending';
    editor.description = '';
    editor.tiingoTicker = '';
    editor.tiingoFxTicker = '';
    editor.tiingoStartDate = '';
    editor.note = '';
    editor.fxInvert = false;
    xyzReadOnly.value = false; // :6425
    editorMode.value = { kind: 'select', coin: '' }; // :6427
    editorOpen.value = Boolean(resetOptions.keepOpen); // :6428
  }

  /** syncTradfiEditor (:6441-6466). */
  function syncEditor(row: TradfiRow | null, syncOptions: { keepOpen?: boolean } = {}): void {
    if (!row) {
      resetEditor({ keepOpen: Boolean(syncOptions.keepOpen) }); // :6443-6445
      return;
    }
    selectedCoin.value = text(row.xyz_coin); // :6447
    editor.xyzCoin = text(row.xyz_coin); // :6448-6455
    editor.canonicalType = text(row.canonical_type) || 'equity_us';
    editor.status = text(row.status) || 'pending';
    editor.description = text(row.description);
    editor.tiingoTicker = text(row.tiingo_ticker);
    editor.tiingoFxTicker = text(row.tiingo_fx_ticker);
    editor.tiingoStartDate = text(row.tiingo_start_date);
    editor.note = text(row.note);
    editor.fxInvert = Boolean(row.tiingo_fx_invert);
    xyzReadOnly.value = true; // :6458
    editorMode.value = row._in_map
      ? { kind: 'saved', coin: text(row.xyz_coin) } // :6462
      : { kind: 'json', coin: text(row.xyz_coin) }; // :6463
    if (syncOptions.keepOpen) editorOpen.value = true; // :6465
  }

  /** editSelectedTradfiEntry (:6738-6746). */
  function editSelected(): void {
    const row = selectedRow.value;
    if (!row) {
      showToast(t('market.selectTradfiRow'), 'error'); // :6740-6741
      return;
    }
    syncEditor(row, { keepOpen: true }); // :6744
  }

  /** cancelTradfiEditor (:6748-6752). */
  function cancelEditor(): void {
    resetEditor({ keepOpen: false, preserveSelection: Boolean(selectedRow.value) });
    // the follow-up renderTradfiMap({rows}) is reactive: filtered rows and
    // the editor-tail below re-derive automatically
    syncSelectionAndEditor();
  }

  /* ── renderTradfiMap (:6508-6604) ── */

  /**
   * The selection prune (:6535-6537), the empty-table editor reset
   * (:6546-6550) and the editor tail (:6597-6601). Legacy re-ran all of
   * renderTradfiMap on every filter input; option lists are stable between
   * payloads (the server derives them identically to the client fallback)
   * so only the selection/editor slice needs re-syncing.
   */
  function syncSelectionAndEditor(): void {
    const filtered = filteredRows.value;
    if (
      !filtered.some((row) => text(row.xyz_coin) === selectedCoin.value)
    ) {
      selectedCoin.value = ''; // :6535-6537
    }
    if (!filtered.length) {
      resetEditor({ keepOpen: false }); // :6548-6549
      return;
    }
    const row = selectedRow.value;
    if (row && editorOpen.value) {
      syncEditor(row, { keepOpen: true }); // :6600
    } else if (!row && !editorOpen.value) {
      resetEditor({ keepOpen: false, preserveSelection: true }); // :6601
    }
  }

  /** renderTradfiMap (:6508-6604) — payload application. */
  function applyMapPayload(payload: TradfiMapPayload | null | undefined): void {
    const source: TradfiMapPayload = payload ?? {};
    const payloadRows = toRows(source.rows);
    rows.value = payloadRows; // :6509-6510
    if (
      source.meta_cache_info ||
      source.quote_cache_info ||
      source.spec_cache_info ||
      source.canonical_types
    ) {
      lastPayload.value = source; // :6511-6513
    }

    const lists = deriveTradfiOptionLists(source, payloadRows); // :6516-6527
    optionLists.value = lists;
    filters.type = normalizeSelectValue(lists.typeValues, filters.type, true); // :6529
    filters.status = normalizeSelectValue(lists.statusValues, filters.status, true); // :6530
    editor.canonicalType = normalizeSelectValue(lists.canonicalTypes, editor.canonicalType, false); // :6531
    editor.status = normalizeSelectValue(lists.statuses, editor.status, false); // :6532

    loadError.value = '';
    hasRendered.value = true;
    syncSelectionAndEditor(); // :6534-6537 + :6546-6550 + :6597-6601
  }

  /** loadTradfiMappings (:6606-6627). */
  async function loadMappings(): Promise<void> {
    requestId += 1; // :6608
    const currentRequest = requestId;
    try {
      const result = await api.fetchJson<TradfiActionResponse>(
        '/settings/hyperliquid/tradfi-map'
      );
      if (requestId !== currentRequest) return; // :6612
      if (!result.success) {
        throw new Error(result.error || t('market.failedLoadTradfiMap')); // :6613-6615
      }
      if (result.payload && result.payload.selected_xyz_coin) {
        selectedCoin.value = text(result.payload.selected_xyz_coin); // :6616-6618
      }
      applyMapPayload(result.payload ?? {}); // :6619
    } catch (error) {
      if (requestId !== currentRequest) return; // :6621
      const message =
        error instanceof Error && error.message ? serverMsg(error.message) : '';
      loadError.value = message || t('market.failedLoadTradfiMap'); // :6624
    }
  }

  /** applyTradfiPayload (:6629-6635). */
  function applyResultPayload(result: TradfiActionResponse | null | undefined): void {
    if (!result || !result.payload) return;
    if (result.payload.selected_xyz_coin) {
      selectedCoin.value = text(result.payload.selected_xyz_coin); // :6631-6633
    }
    applyMapPayload(result.payload); // :6634
  }

  /* ── filters + selection (:9636-9652) ── */

  function setFilterSymbol(value: string): void {
    filters.symbol = value; // :9637
    syncSelectionAndEditor();
  }

  function setFilterType(value: string): void {
    filters.type = String(value || 'all'); // :9641
    syncSelectionAndEditor();
  }

  function setFilterStatus(value: string): void {
    filters.status = String(value || 'all'); // :9645
    syncSelectionAndEditor();
  }

  function selectCoin(coin: string): void {
    selectedCoin.value = text(coin); // :9651
    syncSelectionAndEditor();
  }

  /* ── saveTradfiMapping (:6977-7013) ── */

  async function saveMapping(): Promise<boolean> {
    const xyzCoin = editor.xyzCoin.toUpperCase(); // :6978
    if (!xyzCoin) {
      showToast(t('market.xyzCoinEmpty'), 'error'); // :6980
      return false;
    }

    const entry = {
      xyz_coin: xyzCoin,
      canonical_type: editor.canonicalType || 'equity_us', // :6986
      description: editor.description,
      tiingo_ticker: editor.tiingoTicker.toUpperCase(), // :6988
      tiingo_fx_ticker: editor.tiingoFxTicker.toUpperCase(), // :6989
      tiingo_fx_invert: editor.fxInvert,
      tiingo_start_date: editor.tiingoStartDate,
      status: editor.status || 'pending', // :6992
      note: editor.note,
      spec_source: 'manual', // :6994
    };

    try {
      const result = await api.fetchJson<TradfiActionResponse>(
        '/settings/hyperliquid/tradfi-map',
        {
          method: 'POST',
          body: JSON.stringify({ entry }), // :6998-7001
        }
      );
      if (!result.success) {
        throw new Error(result.error || t('market.tradfiSaveFailed')); // :7003
      }
      selectedCoin.value = text(result.payload?.selected_xyz_coin) || xyzCoin; // :7005
      applyMapPayload(result.payload ?? {}); // :7006
      showToast(result.message || t('market.tradfiMappingSaved'), 'success'); // :7007
      return true;
    } catch (error) {
      const message =
        error instanceof Error && error.message ? serverMsg(error.message) : '';
      showToast(message || t('market.tradfiSaveFailed'), 'error'); // :7010
      return false;
    }
  }

  /* ── search flows (:6637-6736) ── */

  /** searchTradfiTicker (:6637-6650). */
  function searchTicker(): void {
    const row = selectedRow.value;
    if (!row) {
      showToast(t('market.selectTradfiRow'), 'error'); // :6639-6641
      return;
    }
    windowMode.value = 'search'; // :6643
    if (searchCoin.value !== text(row.xyz_coin)) {
      searchLoading.value = false; // :6645-6648
      searchMessage.value = '';
      searchMessageLevel.value = 'info';
    }
  }

  /** runTradfiTickerSearch (:6652-6708). */
  async function runSearch(rawQuery: string): Promise<void> {
    const row = selectedRow.value;
    if (!row) {
      showToast(t('market.selectTradfiRow'), 'error'); // :6655-6658
      return;
    }
    const query = text(rawQuery).trim(); // :6660
    windowMode.value = 'search'; // :6661
    searchCoin.value = text(row.xyz_coin); // :6662
    searchQuery.value = query; // :6663
    searchResults.value = [];
    searchMessage.value = '';
    searchMessageLevel.value = 'info';
    if (!options.isTiingoConfigured()) {
      searchLoading.value = false;
      searchMessage.value = t('market.noTiingoKey'); // :6669
      searchMessageLevel.value = 'error';
      showToast(t('market.tiingoKeyEmpty'), 'error'); // :6672
      return;
    }
    if (!query) {
      searchLoading.value = false;
      searchMessage.value = t('market.searchQueryEmpty'); // :6677
      searchMessageLevel.value = 'error';
      return;
    }
    searchLoading.value = true; // :6682
    try {
      const result = await api.fetchJson<{
        success?: boolean;
        error?: string;
        message?: string;
        results?: unknown;
        xyz_coin?: unknown;
        query?: unknown;
      }>('/settings/hyperliquid/tradfi-map/search-ticker', {
        method: 'POST',
        body: JSON.stringify({ xyz_coin: row.xyz_coin, query }), // :6685-6688
      });
      if (!result.success) {
        throw new Error(result.error || t('market.tiingoSearchFailed')); // :6690
      }
      searchResults.value = Array.isArray(result.results)
        ? (result.results as TradfiSearchItem[])
        : []; // :6692
      searchCoin.value = text(result.xyz_coin) || text(row.xyz_coin); // :6693
      searchQuery.value = text(result.query) || query || text(row.xyz_coin); // :6694
      searchMessage.value = searchResults.value.length
        ? String(result.message || t('market.foundTickerMatches', { count: searchResults.value.length }))
        : t('market.noTiingoMatches'); // :6695-6697
      searchMessageLevel.value = searchResults.value.length ? 'success' : 'info'; // :6698
    } catch (error) {
      searchResults.value = [];
      const message =
        error instanceof Error && error.message ? serverMsg(error.message) : '';
      searchMessage.value = message || t('market.tiingoSearchFailed'); // :6701
      searchMessageLevel.value = 'error';
      showToast(message || t('market.tiingoSearchFailed'), 'error'); // :6703
    } finally {
      searchLoading.value = false; // :6705
    }
  }

  /** applyTradfiSearchResult (:6710-6736). */
  async function applySearchResult(index: number): Promise<void> {
    const result = searchResults.value[index];
    if (!result) return; // :6711-6712
    const row = selectedRow.value;
    if (!row) {
      showToast(t('market.selectTradfiRow'), 'error'); // :6714-6715
      return;
    }
    syncEditor(row); // :6718
    editor.description = text(row.description) || text(result.name) || ''; // :6719
    editor.tiingoTicker = text(result.ticker); // :6720
    editor.tiingoFxTicker = ''; // :6721
    editor.fxInvert = false; // :6722
    editor.status = 'alias'; // :6723
    const noteSuffix = `Tiingo search: ${text(result.name || result.ticker).trim()}`; // :6725
    const currentNote = editor.note; // :6724 — re-read after the sync
    const nextNote = currentNote && currentNote.includes(noteSuffix)
      ? currentNote
      : currentNote
        ? `${currentNote} [${noteSuffix}]`
        : noteSuffix; // :6726-6728
    editor.note = nextNote;
    const saved = await saveMapping(); // :6730
    if (saved) {
      searchMessage.value = t('market.tickerSaved', {
        ticker: text(result.ticker),
        coin: text(row.xyz_coin),
      }); // :6732
      searchMessageLevel.value = 'success'; // :6733
    }
  }

  /* ── renderTradfiActionResult (:5747-5803) ── */

  function clearActionResult(): void {
    actionResult.value = null; // :5747-5752
  }

  function setActionResult(
    level: string | undefined,
    title: unknown,
    details?: unknown,
    groups?: unknown
  ): void {
    const normalizedLevel = (level || 'success') as TradfiActionResult['level']; // :5757
    const lines = Array.isArray(details)
      ? details.filter((line): line is string => Boolean(line))
      : []; // :5758
    const normalizedGroups = Array.isArray(groups)
      ? (groups
          .filter(
            (group): group is { label?: unknown; count?: unknown; items?: unknown } =>
              Boolean(group) && typeof group === 'object' && Boolean((group as { label?: unknown }).label)
          )
          .map((group) => ({
            label: text(group.label),
            count: Number(group.count || 0),
            items: Array.isArray(group.items)
              ? group.items.filter((item): item is string => Boolean(item))
              : [],
          })) as TradfiActionResultGroup[])
      : []; // :5759-5767
    if (!title && !lines.length && !normalizedGroups.length) {
      clearActionResult(); // :5768-5771
      return;
    }
    actionResult.value = {
      level: normalizedLevel,
      title: String(title ?? ''),
      details: lines,
      groups: normalizedGroups,
    };
  }

  /* ── action endpoints + specs window (:6754-6975) — useTradfiActions ── */

  const {
    testResolve,
    fetchStartDate,
    fetchAllStartDates,
    refreshSpecs,
    autoMap,
    refreshMetadata,
    refreshPrices,
    loadSpecsView,
  } = useTradfiActions({
    api,
    t,
    showToast,
    isTiingoConfigured: options.isTiingoConfigured,
    selectedRow,
    windowMode,
    specsPayload,
    specsLoadingMessage,
    applyResultPayload,
    setActionResult,
  });

  /* ── window + reset (:5955-5961, :7399-7401) ── */

  /** closeTradfiSpecsWindow (:5955-5961). */
  function closeWindow(): void {
    windowMode.value = '';
  }

  /**
   * The non-hyperliquid settings tail (:7399-7401). Deviation (documented):
   * legacy left the stale cache note in the hidden card's DOM; the reactive
   * port clears lastPayload so no stale text survives.
   */
  function resetForOtherExchange(): void {
    rows.value = []; // :7399
    lastPayload.value = {};
    resetEditor({}); // :7400
  }

  return {
    rows,
    filters,
    optionLists,
    selectedCoin,
    selectedRow,
    filteredRows,
    loadError,
    lastPayload,
    cacheNote,
    countText,
    editorOpen,
    editor,
    editorMode,
    xyzReadOnly,
    actionButtons,
    windowMode,
    searchResults,
    searchCoin,
    searchQuery,
    searchLoading,
    searchMessage,
    searchMessageLevel,
    specsPayload,
    specsLoadingMessage,
    actionResult,
    hasRendered,
    loadMappings,
    applyResultPayload,
    setFilterSymbol,
    setFilterType,
    setFilterStatus,
    selectCoin,
    syncEditor,
    resetEditor,
    editSelected,
    cancelEditor,
    saveMapping,
    searchTicker,
    runSearch,
    applySearchResult,
    testResolve,
    fetchStartDate,
    fetchAllStartDates,
    refreshSpecs,
    autoMap,
    refreshMetadata,
    refreshPrices,
    loadSpecsView,
    closeWindow,
    clearActionResult,
    setActionResult,
    resetForOtherExchange,
  };
}
