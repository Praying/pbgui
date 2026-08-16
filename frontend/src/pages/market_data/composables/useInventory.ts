import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import {
  formatInventoryTableValue,
  getInventoryCoinDisplayNames,
  getInventoryTableColumns,
  type InventoryColumn,
} from '../lib/inventoryColumns';
import { filterInventoryRows, sortInventoryRows } from '../lib/inventorySort';
import { inventoryPath } from '../lib/inventoryUrls';
import { getInventoryQueueActionConfig } from '../lib/inventoryQueueConfig';
import type { PlotlyLike } from '../lib/heatmapFigure';
import type { InventoryPlotKey } from './useInventoryHeatmap';
import {
  computeMissingToggleSupport,
  getInventoryAvailableTimeframes,
  isTimeframeFilterSupported,
  normalizeInventoryKindFilter,
  normalizeInventoryTimeframeFilter,
  useInventoryViewState,
  type InventoryViewState,
  type InventoryViewStateApi,
} from './useInventoryViewState';
import { useInventoryHeatmap, type InventoryHeatmapController } from './useInventoryHeatmap';
import { useInventoryActions, type InventoryActionsController } from './useInventoryActions';
import type {
  InventoryFeedback,
  InventoryMetric,
  InventoryPayload,
  InventoryRow,
} from '../lib/inventoryTypes';
import type { ConfirmDialogRequest } from './useConfirmDialog';
import type { ShowToastFn, TranslateFn } from './useSettings';
import type { InventorySubsection } from '../types';

/*
 * M-data-6 — the inventory store root (legacy market_data_main.html):
 *
 *   loadInventoryPanel        :8682-8733
 *   renderInventoryMetrics    :7851-7866
 *   renderInventoryTable      :8004-8064  (filter+sort+selection prune)
 *   updateInventorySelectionCount :8066-8077
 *   select/deselect/toggle    :8079-8114
 *   renderInventorySidebarActions :8339-8386
 *   syncInventoryMissingToggle :6331-6348
 *   syncInventorySubsectionVisibility :6350-6374
 *   filter/sort bind slices   :9357-9386, :9517-9524
 *
 * Deviation (documented): legacy refired the delete-older preview POST from
 * renderInventorySidebarActions on every table re-render (every sort click
 * with a live cutoff); the port refreshes the preview only when its inputs
 * change — cutoff set/changed, selection committed — which is the only
 * behavior visible in the dialog.
 */

export interface InventoryApi {
  fetchJson<T>(path: string, init?: RequestInit): Promise<T>;
  fetchHeatmapJson<T>(path: string, init?: RequestInit): Promise<T>;
}

export interface UseInventoryOptions {
  api: InventoryApi;
  t: TranslateFn;
  showToast: ShowToastFn;
  confirm(request?: ConfirmDialogRequest): Promise<boolean>;
  /** Normalized context exchange key (uiState.contextExchange). */
  getExchange(): string;
  /** Legacy .active-panel check (:6335, :6356). */
  isPanelActive(): boolean;
  /** The global vendor Plotly (recon R6 — never bundled). */
  getPlotly(): PlotlyLike | undefined;
  storage?: Storage;
}

export interface MetricCard {
  label: string;
  value: string;
  note?: string;
}

export interface InventoryController extends InventoryViewStateApi {
  /* sub-controllers */
  heatmap: InventoryHeatmapController;
  actions: InventoryActionsController;

  /* resolved context (uiState.contextExchange × resolved view) — the
     template bindings of InventoryPanel/App read the live state bag
     through these instead of re-deriving the exchange::view key */
  currentExchange: ComputedRef<string>;
  currentView: ComputedRef<InventorySubsection>;
  currentViewState: ComputedRef<InventoryViewState>;

  /* panel render state (:8682-8733) */
  title: Ref<string>;
  helperNote: Ref<string>;
  feedback: Ref<InventoryFeedback>;
  tableError: Ref<string>;
  metrics: Ref<MetricCard[]>;

  /* table view model (:8004-8064) */
  columns: ComputedRef<InventoryColumn[]>;
  tableRows: ComputedRef<InventoryRow[]>;
  tableEmptyText: ComputedRef<string>;
  hasTableRows: ComputedRef<boolean>;
  selectionCountText: ComputedRef<string>;
  selectAllDisabled: ComputedRef<boolean>;
  deselectAllDisabled: ComputedRef<boolean>;

  /* selection (:8066-8114) */
  selectedRow: ComputedRef<InventoryRow | null>;
  selectedCoins: ComputedRef<string[]>;
  selectedCoinLabels: ComputedRef<string[]>;

  /* toolbar + missing toggle (:6306-6348) */
  timeframeFilterSupported: ComputedRef<boolean>;
  availableTimeframes: ComputedRef<string[]>;
  /** The kind filter options (:3521-3527 + hyperliquid-only disabling :6268-6286). */
  kindOptions: ComputedRef<{ value: string; label: string; hyperliquidOnly: boolean; disabled: boolean }[]>;
  missingToggleSupported: ComputedRef<boolean>;
  missingTogglePressed: ComputedRef<boolean>;
  missingToggleText: ComputedRef<string>;
  missingToggleTitle: ComputedRef<string>;

  /* sidebar actions (:8339-8386, :6350-6374) */
  availableViews: ComputedRef<InventorySubsection[]>;
  subsectionNavVisible: ComputedRef<boolean>;
  sidebarBuildVisible: ComputedRef<boolean>;
  sidebarBuildText: ComputedRef<string>;
  sidebarBuildDisabled: ComputedRef<boolean>;
  sidebarDeleteSectionVisible: ComputedRef<boolean>;
  sidebarDeleteText: ComputedRef<string>;
  sidebarDeleteDisabled: ComputedRef<boolean>;
  sidebarOlderDisabled: ComputedRef<boolean>;

  /* plot host registry (HeatmapPlot registers its divs) */
  registerPlot(key: InventoryPlotKey, el: HTMLElement | null): void;

  /* actions */
  loadPanel(forceReload: boolean): Promise<void>;
  setCoinFilter(value: string): void;
  setKindFilter(value: string): void;
  setTimeframeFilter(value: string): void;
  toggleSort(sortKey: string): void;
  selectAll(): void;
  deselectAll(): void;
  toggleRow(rowId: string): void;
  /** Drag-commit (:9502-9506) — ids collected from the DOM at mouseup. */
  commitSelectionIds(ids: string[]): void;
  toggleIncludeMissing(): void;
  /** syncInventorySubsectionVisibility (:6350-6374) — exchange fan-out. */
  syncSubsectionVisibility(exchange?: string): void;
}

/** The kind filter options (:3521-3527). */
const KIND_OPTIONS: readonly { value: string; label: string; hyperliquidOnly: boolean }[] = [
  { value: 'all', label: 'all', hyperliquidOnly: false },
  { value: 'crypto', label: 'crypto', hyperliquidOnly: false },
  { value: 'stocks (xyz)', label: 'xyz only', hyperliquidOnly: true },
  { value: 'xyz mapped', label: 'xyz mapped', hyperliquidOnly: true },
  { value: 'xyz not mapped', label: 'xyz not mapped', hyperliquidOnly: true },
];

export function useInventory(options: UseInventoryOptions): InventoryController {
  const { api, t, showToast, getExchange, isPanelActive, getPlotly } = options;

  let requestId = 0; // inventoryState.requestId
  const plotEls: Partial<Record<InventoryPlotKey, HTMLElement>> = {};

  const viewStateApi = useInventoryViewState({ storage: options.storage });
  const { activeView, getState, getAvailableViews, getResolvedView, setActiveView } = viewStateApi;

  /* current exchange::view state — resolved like getCurrentInventoryViewState (:6230-6232) */
  const exchangeRef = ref(getExchange());
  const resolvedView = computed<InventorySubsection>(() => getResolvedView(exchangeRef.value));
  const currentViewState = computed<InventoryViewState>(() => getState(exchangeRef.value, resolvedView.value));
  const viewState = () => currentViewState.value; // legacy's mutable getter

  // keep the resolved exchange live for the computed above (legacy read
  // uiState.contextExchange at every call site)
  watch(
    () => getExchange(),
    (next) => {
      exchangeRef.value = next;
    },
    { flush: 'sync' }
  );

  /* ── panel render state ── */

  const title = ref(t('market.ohlcvData'));
  const helperNote = ref(t('market.clickRowHeatmap'));
  const feedback = ref<InventoryFeedback>({ message: '', level: 'info' });
  const tableError = ref('');
  const metrics = ref<MetricCard[]>([]);

  /* ── table view model (:8004-8064) ── */

  const columns = computed<InventoryColumn[]>(() =>
    getInventoryTableColumns(resolvedView.value, exchangeRef.value, t)
  );

  const tableRows = computed<InventoryRow[]>(() => {
    if (tableError.value) return []; // :8727 — the table DOM was replaced by the error text
    const state = viewState();
    const sortKey = state.sortKey;
    if (!columns.value.some((column) => column.key === sortKey)) {
      // render-time guard (:8026-8031)
      return sortInventoryRows(
        filterInventoryRows(state.rows, state),
        'coin',
        'asc'
      );
    }
    return sortInventoryRows(filterInventoryRows(state.rows, state), sortKey, state.sortDirection);
  });

  const hasTableRows = computed(() => tableRows.value.length > 0);

  const tableEmptyText = computed(() => {
    if (tableError.value) return tableError.value; // :8727 — error text in the table's place
    const state = viewState();
    if (state.rows.length) return t('market.noRowsMatchFilters'); // :8017-8018
    return String(state.payload?.empty_message || t('market.noDataFound')); // :8019
  });

  /* selection pruning (:8012-8014) — legacy pruned inside every table
     render; the error path replaced the DOM without re-rendering, so an
     error load leaves the selection (and stale rows) untouched */
  watch(
    tableRows,
    (rows) => {
      if (tableError.value) return; // no render ran to prune (:8726-8727)
      const state = viewState();
      const ids = new Set(rows.map((row) => String(row.row_id ?? '')));
      if (state.selectedRowIds.some((id) => !ids.has(id))) {
        state.selectedRowIds = state.selectedRowIds.filter((id) => ids.has(id));
      }
    },
    { flush: 'sync' }
  );

  /* ── selection (:8066-8114) ── */

  const selectedRows = computed<InventoryRow[]>(() => {
    const state = viewState();
    const ids = new Set(state.selectedRowIds);
    return state.rows.filter((row) => ids.has(String(row.row_id ?? ''))); // :6237-6239
  });

  const selectedRow = computed<InventoryRow | null>(() =>
    selectedRows.value.length === 1 ? (selectedRows.value[0] ?? null) : null
  ); // :6326-6329

  const selectedCoins = computed<string[]>(() =>
    Array.from(
      new Set(
        selectedRows.value
          .map((row) => String(row.coin ?? '').toUpperCase())
          .filter(Boolean)
      )
    )
  ); // :6242-6246 + the sidebar's uniqueness (:8342)

  const selectedCoinLabels = computed(() => getInventoryCoinDisplayNames(selectedCoins.value));

  const selectionCountText = computed(() =>
    t('market.rowsSelected', { selected: viewState().selectedRowIds.length, total: tableRows.value.length })
  ); // :8073
  const selectAllDisabled = computed(
    () => viewState().selectedRowIds.length >= tableRows.value.length // :8074
  );
  const deselectAllDisabled = computed(() => viewState().selectedRowIds.length === 0); // :8075

  /** The post-selection heatmap refresh (:8086, :8094, :8109). */
  function refreshHeatmapAfterSelection(): void {
    if (selectedRow.value) void heatmap.loadHeatmap();
    else heatmap.clearHeatmap(t('market.clickRowHeatmap'));
  }

  /** selectAllInventoryRows (:8079-8087). */
  function selectAll(): void {
    const state = viewState();
    state.selectedRowIds = tableRows.value
      .map((row) => String(row.row_id ?? ''))
      .filter(Boolean);
    state.olderPreview = null;
    void heatmap.loadHeatmap();
  }

  /** deselectAllInventoryRows (:8089-8095). */
  function deselectAll(): void {
    const state = viewState();
    state.selectedRowIds = [];
    state.olderPreview = null;
    heatmap.clearHeatmap(t('market.clickRowHeatmap'));
  }

  /** toggleInventoryRow (:8097-8110). */
  function toggleRow(rowId: string): void {
    const state = viewState();
    const id = String(rowId ?? '');
    const index = state.selectedRowIds.indexOf(id);
    state.selectedRowIds =
      index === -1
        ? [...state.selectedRowIds, id]
        : state.selectedRowIds.filter((_, position) => position !== index);
    state.olderPreview = null;
    void heatmap.loadHeatmap();
  }

  /** The drag mouseup commit (:9502-9506). */
  function commitSelectionIds(ids: string[]): void {
    const state = viewState();
    state.selectedRowIds = ids.filter(Boolean);
    state.olderPreview = null;
    void heatmap.loadHeatmap();
  }

  /* ── filters + sort (:9357-9386) ── */

  function setCoinFilter(value: string): void {
    viewState().coinFilter = String(value ?? '');
    refreshHeatmapAfterSelection();
  }

  function setKindFilter(value: string): void {
    viewState().kindFilter = String(value ?? 'all');
    refreshHeatmapAfterSelection();
  }

  function setTimeframeFilter(value: string): void {
    viewState().timeframeFilter = String(value ?? 'all').toLowerCase();
    refreshHeatmapAfterSelection();
  }

  /** toggleInventorySort (:7967-7977) — render-only, no heatmap reload. */
  function toggleSort(sortKey: string): void {
    const state = viewState();
    const nextKey = String(sortKey || 'coin');
    if (String(state.sortKey || 'coin') === nextKey) {
      state.sortDirection = state.sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      state.sortKey = nextKey;
      state.sortDirection = 'asc';
    }
  }

  /* ── missing-rows toggle (:6331-6348, :9517-9524) ── */

  const missingToggleSupported = computed(() =>
    computeMissingToggleSupport({
      isPanelActive: isPanelActive(),
      exchange: exchangeRef.value,
      view: resolvedView.value,
      payload: viewState().payload,
    })
  );
  const missingTogglePressed = computed(
    () => missingToggleSupported.value && viewState().includeMissingRows
  );
  const missingToggleText = computed(() =>
    missingTogglePressed.value ? t('market.hideNoL2bookYet') : t('market.showNoL2bookYet')
  );
  const missingToggleTitle = computed(() => t('market.includeMissingL2bookTitle'));

  /** The toggle click (:9517-9523). */
  function toggleIncludeMissing(): void {
    const state = viewState();
    state.includeMissingRows = !state.includeMissingRows;
    state.selectedRowIds = [];
    state.olderPreview = null;
    heatmap.clearHeatmap(t('market.clickRowHeatmap'));
    void loadPanel(true);
  }

  /* ── timeframe toolbar (:6306-6324) ── */

  const availableTimeframes = computed(() => getInventoryAvailableTimeframes(viewState().rows));
  const timeframeFilterSupported = computed(() =>
    isTimeframeFilterSupported(resolvedView.value, availableTimeframes.value)
  );

  /* ── sidebar actions view model (:8339-8386, :6350-6374) ── */

  const kindOptions = computed(() =>
    KIND_OPTIONS.map((option) => ({
      ...option,
      disabled: option.hyperliquidOnly && exchangeRef.value !== 'hyperliquid',
    }))
  );

  const availableViews = computed(() => getAvailableViews(exchangeRef.value));
  const subsectionNavVisible = computed(() => isPanelActive()); // :6357
  // :6358 (hidden while another panel is active) composed with :8352
  // (queueConfig + selection) — the two legacy write sites of the flag
  const sidebarBuildVisible = computed(
    () => isPanelActive() && queueConfig.value !== null && selectedCoins.value.length > 0
  );
  const sidebarDeleteSectionVisible = computed(
    () => isPanelActive() && resolvedView.value !== 'pb7_cache' // :6370
  );

  const queueConfig = computed(() => getInventoryQueueActionConfig(exchangeRef.value, resolvedView.value));

  const sidebarBuildText = computed(() => {
    const coins = selectedCoins.value;
    const labels = selectedCoinLabels.value;
    const isL2BookAction = queueConfig.value?.kind === 'l2book';
    if (queueConfig.value && coins.length > 0) {
      return isL2BookAction
        ? coins.length === 1
          ? t('market.queueL2bookForCoin', { coin: labels[0] ?? '' })
          : t('market.queueL2bookForCoins', { count: coins.length })
        : coins.length === 1
          ? t('market.buildBest1mForCoin', { coin: labels[0] ?? '' })
          : t('market.buildBest1mForCoins', { count: coins.length }); // :8356-8362
    }
    return resolvedView.value === 'l2Book' && exchangeRef.value === 'hyperliquid'
      ? t('market.queueL2bookDownload')
      : t('market.buildBest1m'); // :8366-8368
  });
  const sidebarBuildDisabled = computed(
    () => selectedCoins.value.length === 0 || actions.buildInFlight.value
  ); // :8369/:8363 + the in-flight disable (:8413 → :8469)

  const sidebarDeleteText = computed(() => {
    const coins = selectedCoins.value;
    const labels = selectedCoinLabels.value;
    return coins.length === 1
      ? t('market.deleteCoinName', { coin: labels[0] ?? '' })
      : coins.length > 1
        ? t('market.deleteCoinsCount', { count: coins.length })
        : t('market.deleteSelected'); // :8374
  });
  const sidebarDeleteDisabled = computed(() => selectedCoins.value.length === 0); // :8379
  const sidebarOlderDisabled = computed(() => selectedCoins.value.length === 0); // :8382

  /* ── heatmap sub-controller (:8474-8680) ── */

  const heatmap = useInventoryHeatmap({
    api,
    t,
    getExchange: () => exchangeRef.value,
    getViewState: viewState,
    getSelectedRow: () => selectedRow.value,
    getSelectedCoinCount: () => selectedCoins.value.length,
    getPlotly,
    getPlotEl: (key) => plotEls[key],
  });

  function registerPlot(key: InventoryPlotKey, el: HTMLElement | null): void {
    if (el) plotEls[key] = el;
    else delete plotEls[key];
  }

  /* ── destructive + queue actions (:8217-8854) ── */

  const actions = useInventoryActions({
    api,
    t,
    showToast,
    confirm: options.confirm,
    getExchange: () => exchangeRef.value,
    getViewState: viewState,
    getViewKey: () => resolvedView.value,
    getSelectedCoins: () => selectedCoins.value,
    getCoinLabels: () => selectedCoinLabels.value,
    reloadPanel: (force) => void loadPanel(force),
  });

  /** loadInventoryPanel (:8682-8733). */
  async function loadPanel(forceReload: boolean): Promise<void> {
    void forceReload; // :8683 — legacy void-ed it too
    exchangeRef.value = getExchange();
    const viewKey = resolvedView.value;
    const state = viewState();
    const currentRequestId = ++requestId; // :8686
    syncSubsectionVisibility();
    feedback.value = { message: t('market.loadingInventory'), level: 'info' }; // :8688
    try {
      const payload = await api.fetchJson<InventoryPayload>(
        inventoryPath(
          exchangeRef.value,
          viewKey,
          state.includeMissingRows && exchangeRef.value === 'hyperliquid' && viewKey === 'l2Book'
        )
      ); // :8690-8692
      if (currentRequestId !== requestId) return; // :8693
      if (!payload.success) throw new Error(payload.error || t('market.failedLoadInventory')); // :8694
      state.payload = payload;
      state.includeMissingRows = Boolean(payload.include_missing_current); // :8696
      state.rows = Array.isArray(payload.rows) ? (payload.rows as InventoryRow[]) : []; // :8697
      state.availableCoins = Array.isArray(payload.available_coins)
        ? (payload.available_coins as string[])
        : []; // :8698
      state.kindFilter = normalizeInventoryKindFilter(state.kindFilter, exchangeRef.value); // :8705
      state.timeframeFilter = normalizeInventoryTimeframeFilter(
        viewKey,
        state.timeframeFilter,
        getInventoryAvailableTimeframes(state.rows)
      ); // :8706-8710
      title.value = String(payload.view_label || t('market.ohlcvData')); // :8702
      helperNote.value = String(payload.helper_note || t('market.clickRowHeatmap')); // :8703
      renderMetrics(payload);
      tableError.value = '';
      if (selectedRow.value) {
        await heatmap.loadHeatmap(); // :8716-8718
      } else {
        heatmap.clearHeatmap(t('market.clickRowHeatmap')); // :8719
      }
      feedback.value = { message: '', level: 'info' }; // :8721
    } catch (error) {
      if (currentRequestId !== requestId) return; // :8723
      state.payload = null;
      state.kindFilter = normalizeInventoryKindFilter(state.kindFilter, exchangeRef.value); // :8725
      renderMetrics({ metrics: [] }); // :8727
      tableError.value =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedLoadInventory'); // :8728
      feedback.value = { message: tableError.value, level: 'error' }; // :8729
      heatmap.clearHeatmap(t('market.failedLoadInventory')); // :8731
    }
  }

  /** renderInventoryMetrics (:7851-7866). */
  function renderMetrics(payload: InventoryPayload): void {
    const list = Array.isArray(payload?.metrics) ? (payload.metrics as InventoryMetric[]) : [];
    if (!list.length) {
      metrics.value = [
        {
          label: t('market.inventory'),
          value: t('market.unavailable'),
          note: t('market.noInventoryMetrics'),
        },
      ]; // :7856
      return;
    }
    metrics.value = list.map((metric) => ({
      label: String(metric.label ?? ''),
      value: String(metric.value ?? ''),
    })); // :7859-7865
  }

  /** syncInventorySubsectionVisibility (:6350-6374) — exchange fan-out entry. */
  function syncSubsectionVisibility(exchange?: string): void {
    const nextExchange = exchange ?? getExchange();
    exchangeRef.value = nextExchange;
    const available = getAvailableViews(nextExchange);
    if (!available.includes(activeView.value)) {
      activeView.value = '1m'; // :6196-6197 — the legacy write-back
    }
  }

  /* the delete-older preview refresh — on its real inputs only */
  watch(
    () => [viewState().olderCutoffDay, viewState().selectedRowIds.join(' ')] as const,
    () => {
      if (actions.olderDialogVisible.value) void actions.loadOlderPreview();
    }
  );

  return {
    ...viewStateApi,
    heatmap,
    actions,
    currentExchange: computed(() => exchangeRef.value),
    currentView: resolvedView,
    currentViewState,
    title,
    helperNote,
    feedback,
    tableError,
    metrics,
    columns,
    tableRows,
    tableEmptyText,
    hasTableRows,
    selectionCountText,
    selectAllDisabled,
    deselectAllDisabled,
    selectedRow,
    selectedCoins,
    selectedCoinLabels,
    timeframeFilterSupported,
    availableTimeframes,
    kindOptions,
    missingToggleSupported,
    missingTogglePressed,
    missingToggleText,
    missingToggleTitle,
    availableViews,
    subsectionNavVisible,
    sidebarBuildVisible,
    sidebarBuildText,
    sidebarBuildDisabled,
    sidebarDeleteSectionVisible,
    sidebarDeleteText,
    sidebarDeleteDisabled,
    sidebarOlderDisabled,
    registerPlot,
    loadPanel,
    setCoinFilter,
    setKindFilter,
    setTimeframeFilter,
    toggleSort,
    selectAll,
    deselectAll,
    toggleRow,
    commitSelectionIds,
    toggleIncludeMissing,
    syncSubsectionVisibility,
  };
}

/** Cell formatting accessor for the table component (:8056). */
export function cellText(
  viewKey: InventorySubsection,
  columnKey: string,
  row: InventoryRow,
  exchangeKey: string
): string {
  return formatInventoryTableValue(viewKey, columnKey, row, exchangeKey);
}
