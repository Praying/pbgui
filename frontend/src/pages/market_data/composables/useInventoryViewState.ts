import { reactive, ref, type Ref } from 'vue';
import {
  persistInventorySubsection,
  readInventorySubsection,
} from './usePanels';
import type { InventorySubsection } from '../types';
import type { HeatmapInfo, InventoryPayload, InventoryRow, OlderPreviewPayload } from '../lib/inventoryTypes';

/*
 * M-data-6 — inventory view state (legacy market_data_main.html):
 *
 *   getAvailableInventoryViews     :6187-6191
 *   getResolvedInventoryView       :6193-6199
 *   createInventoryViewState       :6201-6229
 *   getInventoryViewState          :6222-6228  (exchange::view keying)
 *   syncInventoryKindFilterOptions :6268-6288  (hyperliquid-only options)
 *   getInventoryAvailableTimeframes :6290-6304
 *   syncInventoryTimeframeFilter   :6306-6324  (pb7_cache only)
 *   syncInventoryMissingToggle     :6331-6348
 *   setActiveInventoryView         :6376-6386
 *
 * Deviation (documented): legacy resolved the active view by mutating
 * inventoryState inside getResolvedInventoryView (:6197); the reactive port
 * resolves read-only and only writes back in syncSubsectionVisibility —
 * the exchange fan-out call — so the persisted key tracks what the user
 * actually sees (:6196-6197 parity).
 */

/** One per exchange::view state bag (:6201-6229), reactive when created
 *  through the composable. */
export interface InventoryViewState {
  payload: InventoryPayload | null;
  rows: InventoryRow[];
  availableCoins: string[];
  includeMissingRows: boolean;
  coinFilter: string;
  kindFilter: string;
  timeframeFilter: string;
  sortKey: string;
  sortDirection: string;
  selectedRowIds: string[];
  olderCutoffDay: string;
  olderPreview: OlderPreviewPayload | null;
  selectedMonth: string;
  heatmapInfo: HeatmapInfo | null;
  showHoliday: boolean;
  showOos: boolean;
}

/** Legacy getAvailableInventoryViews (:6187-6191). */
export function getAvailableInventoryViews(exchangeKey: string): InventorySubsection[] {
  return exchangeKey === 'hyperliquid'
    ? ['1m', '1m_api', 'l2Book', 'pb7_cache']
    : ['1m', 'pb7_cache'];
}

/** Legacy createInventoryViewState (:6201-6229). */
export function createInventoryViewState(): InventoryViewState {
  return {
    payload: null,
    rows: [],
    availableCoins: [],
    includeMissingRows: false,
    coinFilter: '',
    kindFilter: 'all',
    timeframeFilter: 'all',
    sortKey: 'coin',
    sortDirection: 'asc',
    selectedRowIds: [],
    olderCutoffDay: '',
    olderPreview: null,
    selectedMonth: '',
    heatmapInfo: null,
    showHoliday: true,
    showOos: true,
  };
}

/** Legacy syncInventoryKindFilterOptions availability slice (:6279-6286). */
export function normalizeInventoryKindFilter(kindFilter: string, exchangeKey: string): string {
  const value = String(kindFilter || 'all');
  const isHyperliquidOnly =
    value === 'stocks (xyz)' || value === 'xyz only' || value === 'xyz mapped' || value === 'xyz not mapped' || value === 'xyz missing';
  if (isHyperliquidOnly && exchangeKey !== 'hyperliquid') return 'all'; // :6284-6286
  return value;
}

/** Legacy getInventoryAvailableTimeframes (:6290-6304). */
export function getInventoryAvailableTimeframes(rows: readonly InventoryRow[]): string[] {
  const seen = new Set<string>();
  return rows
    .map((row) => String(row.timeframe ?? '').trim().toLowerCase())
    .filter((timeframe) => {
      if (!timeframe || seen.has(timeframe)) return false;
      seen.add(timeframe);
      return true;
    })
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Legacy wrap.hidden predicate (:6313). */
export function isTimeframeFilterSupported(viewKey: InventorySubsection, available: readonly string[]): boolean {
  return viewKey === 'pb7_cache' && available.length > 1;
}

/** Legacy load-timeframe normalization (:8706-8710). */
export function normalizeInventoryTimeframeFilter(
  viewKey: InventorySubsection,
  timeframeFilter: string,
  available: readonly string[]
): string {
  if (viewKey !== 'pb7_cache') return 'all'; // :8706-8707
  const active = String(timeframeFilter || 'all').toLowerCase();
  if (active !== 'all' && !available.includes(active)) return 'all'; // :8708-8710
  return active;
}

/** Legacy syncInventoryMissingToggle support predicate (:6338-6341). */
export function computeMissingToggleSupport(args: {
  isPanelActive: boolean;
  exchange: string;
  view: InventorySubsection;
  payload: InventoryPayload | null;
}): boolean {
  return (
    args.isPanelActive &&
    args.exchange === 'hyperliquid' &&
    args.view === 'l2Book' &&
    Boolean(args.payload?.include_missing_supported)
  );
}

export interface UseInventoryViewStateOptions {
  storage?: Storage;
}

export interface InventoryViewStateApi {
  activeView: Ref<InventorySubsection>;
  /** Per exchange::view states, created on demand and reactive (:6222-6228). */
  getState(exchange: string, viewKey: InventorySubsection): InventoryViewState;
  /** getAvailableInventoryViews (:6187-6191). */
  getAvailableViews(exchange: string): InventorySubsection[];
  /** getResolvedInventoryView (:6193-6199) — read-only resolution. */
  getResolvedView(exchange: string): InventorySubsection;
  /** setActiveInventoryView (:6376-6386) — set + persist. */
  setActiveView(viewKey: InventorySubsection): void;
}

/** The persisted view state layer. */
export function useInventoryViewState(options: UseInventoryViewStateOptions = {}): InventoryViewStateApi {
  const storage = options.storage ?? window.localStorage;
  const activeView = ref<InventorySubsection>(readInventorySubsection(storage)); // :3825
  const viewStates = reactive<Record<string, InventoryViewState>>({});

  function getState(exchange: string, viewKey: InventorySubsection): InventoryViewState {
    const stateKey = `${String(exchange ?? '')}::${String(viewKey ?? '1m')}`; // :6223
    let state = viewStates[stateKey];
    if (!state) {
      state = createInventoryViewState();
      viewStates[stateKey] = state; // :6224-6226 — reactive on assignment
    }
    return viewStates[stateKey] as InventoryViewState;
  }

  function getResolvedView(exchange: string): InventorySubsection {
    const available = getAvailableInventoryViews(exchange);
    const active = activeView.value;
    return available.includes(active) ? active : '1m'; // :6195-6196
  }

  function setActiveView(viewKey: InventorySubsection): void {
    activeView.value = viewKey; // :6377
    persistInventorySubsection(storage, viewKey); // :6378-6382
  }

  return { activeView, getState, getAvailableViews: getAvailableInventoryViews, getResolvedView, setActiveView };
}
