/**
 * Dashboard editor state store — the port of the legacy editor's flat
 * `_<row>_<col>` state map + sync layer (dashboard_editor.html:512-626,
 * 2518-2564, 2679-2702).
 *
 * R5: the persisted dashboard JSON is a FLAT map — `name`, `rows`, `cols`
 * plus every per-cell config key suffixed `_<row>_<col>` (see
 * types/widgets.ts PERSISTED_CELL_KEYS). Key names here are the on-disk
 * contract; renaming them corrupts saved dashboards.
 *
 * No Pinia: a module-level singleton over Vue reactivity. `useDashboardStore`
 * returns the shared instance (config merged on first call); tests get a
 * fresh instance via `resetDashboardStore`.
 *
 * Mutation flow mirrors legacy exactly:
 *   edit/standalone → scheduleSync (400 ms debounce → POST /dashboard/pending_full)
 *   view-only       → markViewDirty (postMessage pbgui_view_dirty) +
 *                     saveViewLayout (POST /dashboards/<name>, pbgui_view_saved)
 * Deviations are noted inline.
 *
 * Immutability: the pure per-cell transforms (swapCellKeys/clearCellKeys in
 * lib/grid.ts) build NEW maps; the store applies the result to its single
 * reactive record by replacing contents (Vue's change-propagation mechanism).
 */
import { computed, reactive, ref } from 'vue';
import {
  SYNC_DEBOUNCE_MS,
  cellKey,
  cellPos,
  cellSuffix,
  clampCols,
  clampRows,
  clearCellKeys,
  parseStoredHeight,
  swapCellKeys,
  type RenderableWidgetType,
} from '../lib/grid';

/* ── config ── */

/** Fetch contract: only `ok` is consumed (legacy apiFetch result handling). */
export type StoreFetchFn = (url: string, init?: RequestInit) => Promise<{ ok: boolean }>;

export interface DashboardStoreConfig {
  /** Legacy %%API_BASE%% — origin + /api (dashboard_main/config.ts convention). */
  apiBase: string;
  /** Legacy ORIG_NAME — the name sync targets; fixed at init, not state.name. */
  origName: string;
  /** Legacy VIEW_ONLY — swaps scheduleSync for markViewDirty. */
  viewOnly: boolean;
  /** Legacy STANDALONE — palette/pending_full mode (D-3 reads this). */
  standalone: boolean;
  /** Injectable fetch (tests). Default: global fetch. */
  fetchFn?: StoreFetchFn;
  /** Injectable parent window (tests). Default: window.parent. */
  parentWindow?: () => Window | null;
}

const DEFAULT_CONFIG: DashboardStoreConfig = {
  apiBase: '',
  origName: '',
  viewOnly: false,
  standalone: false,
};

/* ── status ── */

/** Legacy setStatus classes: '' | 'saved' | 'error' (+ legacy 'offline' text). */
export type SyncStatus = '' | 'saving' | 'saved' | 'error' | 'offline';

/* ── store interface ── */

export interface DashboardStore {
  /** The flat persisted state (reactive). Keys are the on-disk contract. */
  readonly state: Record<string, unknown>;
  /** Per-cell widget remount epochs (non-persisted) — legacy buildGrid parity. */
  readonly epochs: Record<string, number>;
  /** Per-cell auto-height flags (non-persisted) — legacy .auto-height class. */
  readonly autoHeightCells: Record<string, boolean>;
  /** Legacy #status element state (D-3 binds this). */
  readonly syncStatus: SyncStatus;
  readonly config: Readonly<DashboardStoreConfig>;

  /** Legacy `state.rows || 1` reads, as plain values (component ergonomics). */
  readonly rows: number;
  readonly cols: number;

  /** Legacy `state['dashboard_type_r_c'] || 'NONE'` — raw persisted value
   *  passthrough (junk persisted values stay un-normalized, R11). */
  cellType(row: number, col: number): string;
  cellHeight(row: number, col: number): number | null;
  hasStoredHeight(row: number, col: number): boolean;
  isAutoHeight(row: number, col: number): boolean;
  epochOf(row: number, col: number): number;

  /** Legacy config-load merge (editor:2679-2694). */
  loadConfig(raw: Record<string, unknown>): void;
  /** Palette drop (editor:2269-2279): set type, rebuild, sync (unconditional). */
  assignCellType(row: number, col: number, type: RenderableWidgetType): void;
  /** clearCell + rebuild + sync (editor:585-593, 1021-1024). */
  clearCell(row: number, col: number): void;
  /** swapCells + rebuild + sync/dirty (editor:2181-2209). */
  swapCells(r1: number, c1: number, r2: number, c2: number): void;
  /** setLayout + rebuild + sync (editor:2534-2541). */
  setLayout(rows: number, cols: number): void;
  /** Header name input (editor:2518-2523). */
  setName(name: string): void;
  /** Resize drag end / Min button (editor:2428-2430, 2484). */
  setCellHeight(row: number, col: number, height: number): void;
  /** Resize dblclick / Max button (editor:2438-2444, 2497-2499). */
  resetCellHeight(row: number, col: number): void;

  /** WS-orchestration rebuild (D-editor-3, editor:2760-2784): bump the cell
   *  epoch so GridCell remounts the widget — the reactive equivalent of the
   *  legacy build*Inline re-render. Never touches persisted state. */
  rebuildCell(row: number, col: number): void;

  /** scheduleSync (editor:595-598) — 400 ms debounce → doSync. */
  scheduleSync(): void;
  /** doSync (editor:600-610). */
  doSync(): Promise<void>;
  /** markViewDirty (editor:612-615). */
  markViewDirty(): void;
  /** saveViewLayout (editor:617-626). */
  saveViewLayout(): Promise<void>;
  /** Whole flat map snapshot (doSync/saveViewLayout payload). */
  serialize(): Record<string, unknown>;
  /** try/catch parent.postMessage (editor:614, 624, 2461, 2476). */
  postParentMessage(type: string): void;
}

/* ── implementation ── */

function defaultFetchFn(url: string, init?: RequestInit): Promise<{ ok: boolean }> {
  return fetch(url, init);
}

function createDashboardStore(config: DashboardStoreConfig): DashboardStore {
  const state = reactive<Record<string, unknown>>({
    name: config.origName,
    rows: 1,
    cols: 1,
  });
  const epochs = reactive<Record<string, number>>({});
  const autoHeightCells = reactive<Record<string, boolean>>({});
  const syncStatusRef = ref<SyncStatus>('');
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  const fetchFn: StoreFetchFn = config.fetchFn ?? defaultFetchFn;
  const parentWindow = config.parentWindow ?? (() => window.parent);

  /* ── derived accessors (legacy `state.rows || 1` reads) ── */

  const rowsComputed = computed<number>(() => {
    const v = state.rows;
    return typeof v === 'number' && !Number.isNaN(v) ? v : 1;
  });

  const colsComputed = computed<number>(() => {
    const v = state.cols;
    return typeof v === 'number' && !Number.isNaN(v) ? v : 1;
  });

  function cellType(row: number, col: number): string {
    return String(state[cellKey('dashboard_type', row, col)] || 'NONE');
  }

  function cellHeight(row: number, col: number): number | null {
    return parseStoredHeight(state[cellKey('dashboard_height', row, col)]);
  }

  function hasStoredHeight(row: number, col: number): boolean {
    return cellHeight(row, col) !== null;
  }

  function isAutoHeight(row: number, col: number): boolean {
    return autoHeightCells[cellPos(row, col)] === true;
  }

  function epochOf(row: number, col: number): number {
    return epochs[cellPos(row, col)] ?? 0;
  }

  /* ── internal helpers ── */

  /** Legacy buildGrid() side-effect: every cell's widget is rebuilt. */
  function bumpCell(row: number, col: number): void {
    const pos = cellPos(row, col);
    epochs[pos] = (epochs[pos] ?? 0) + 1;
  }

  function bumpAllCells(rowsCount: number, colsCount: number): void {
    for (let r = 1; r <= rowsCount; r++) {
      for (let c = 1; c <= colsCount; c++) bumpCell(r, c);
    }
  }

  /** Replace the reactive record's contents with the pure transform result. */
  function applyMap(next: Record<string, unknown>): void {
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, next);
  }

  /** Legacy per-mutation sync choice (editor:2204-2208, 2430, 2443, 2502). */
  function syncAfterMutation(): void {
    if (config.viewOnly) markViewDirty();
    else scheduleSync();
  }

  /**
   * D-editor-6 (the D-2 handoff): _refreshAllOrdersCfg
   * (dashboard_editor.html:2215-2230, called at :2275 when a POSITIONS or
   * ORDERS widget is dropped). Legacy rebuilt every OTHER ORDERS cell's cfg
   * panel — which re-ran buildOrdersInline (link auto-resolution +
   * resubscription) — before the full buildGrid() rebuild. Under the blessed
   * cell-level-rebuild contract a drop only remounts its own cell, so the
   * ORDERS refresh becomes load-bearing: bumping the other ORDERS cells'
   * epochs makes GridCell remount WidgetOrders, reproducing the legacy
   * cfg-panel refresh.
   */
  function refreshOrdersCellsExcept(skipRow: number, skipCol: number): void {
    for (let r = 1; r <= rowsComputed.value; r++) {
      for (let c = 1; c <= colsComputed.value; c++) {
        if (r === skipRow && c === skipCol) continue;
        if (cellType(r, c) !== 'ORDERS') continue;
        bumpCell(r, c);
      }
    }
  }

  /* ── mutations ── */

  function loadConfig(raw: Record<string, unknown>): void {
    const isEmpty = !raw || Object.keys(raw).length === 0;
    applyMap(isEmpty ? {} : { ...raw });
    if (!isEmpty) {
      /* editor:2682-2683 — parseInt-||-1 then clamp */
      state.rows = clampRows(parseInt(String(state.rows), 10) || 1);
      state.cols = clampCols(parseInt(String(state.cols), 10) || 1);
      if (!state.name) state.name = config.origName; // editor:2684
    } else {
      state.name = config.origName;
      state.rows = 1;
      state.cols = 1;
    }
    /* legacy buildGrid() rebuilt every cell's DOM here, so per-cell runtime
       flags (the .auto-height class) never survived a reload — clear them;
       widgets re-mark themselves once their fetch succeeds (D-editor-5 fix). */
    for (const k of Object.keys(autoHeightCells)) delete autoHeightCells[k];
    /* legacy buildGrid() rebuilds every cell after config load */
    bumpAllCells(rowsComputed.value, colsComputed.value);
  }

  function assignCellType(row: number, col: number, type: RenderableWidgetType): void {
    state[cellKey('dashboard_type', row, col)] = type;
    bumpCell(row, col);
    /* editor:2275 — POSITIONS/ORDERS drops refresh every other ORDERS cell */
    if (type === 'POSITIONS' || type === 'ORDERS') refreshOrdersCellsExcept(row, col);
    /* editor:2276 — palette drop schedules a sync unconditionally */
    scheduleSync();
  }

  function clearCell(row: number, col: number): void {
    applyMap(clearCellKeys(state, cellSuffix(row, col)));
    bumpCell(row, col);
    /* legacy callers (_makeDeleteCb) are edit-mode only; the view branch is
       dead there — kept symmetric with swapCells for safety. */
    syncAfterMutation();
  }

  function swapCells(r1: number, c1: number, r2: number, c2: number): void {
    applyMap(swapCellKeys(state, cellSuffix(r1, c1), cellSuffix(r2, c2)));
    bumpCell(r1, c1);
    bumpCell(r2, c2);
    /* editor:2204-2208 */
    syncAfterMutation();
  }

  function setLayout(rowsCount: number, colsCount: number): void {
    state.rows = clampRows(rowsCount);
    state.cols = clampCols(colsCount);
    bumpAllCells(rowsComputed.value, colsComputed.value);
    /* editor:2538 — setLayout always schedules a sync (view mode never
       reaches this code path in legacy — the picker is hidden) */
    scheduleSync();
  }

  function setName(name: string): void {
    state.name = name.trim();
    scheduleSync();
  }

  function setCellHeight(row: number, col: number, height: number): void {
    state[cellKey('dashboard_height', row, col)] = height;
    autoHeightCells[cellPos(row, col)] = false; // editor:2429 removes .auto-height
    syncAfterMutation();
  }

  function resetCellHeight(row: number, col: number): void {
    delete state[cellKey('dashboard_height', row, col)];
    autoHeightCells[cellPos(row, col)] = true; // editor:2439 adds .auto-height
    syncAfterMutation();
  }

  /* ── sync ── */

  function rebuildCell(row: number, col: number): void {
    bumpCell(row, col);
  }

  function scheduleSync(): void {
    if (syncTimer !== null) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      void doSync();
    }, SYNC_DEBOUNCE_MS);
  }

  async function doSync(): Promise<void> {
    syncStatusRef.value = 'saving';
    const payload = serialize();
    try {
      const r = await fetchFn(
        config.apiBase + '/dashboard/pending_full?name=' + encodeURIComponent(config.origName),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      syncStatusRef.value = r.ok ? 'saved' : 'error';
    } catch {
      syncStatusRef.value = 'offline';
    }
  }

  function postParentMessage(type: string): void {
    try {
      parentWindow()?.postMessage({ type }, '*');
    } catch {
      /* legacy swallows cross-origin postMessage failures */
    }
  }

  function markViewDirty(): void {
    if (!config.viewOnly) return;
    postParentMessage('pbgui_view_dirty');
  }

  async function saveViewLayout(): Promise<void> {
    const payload = serialize();
    try {
      await fetchFn(config.apiBase + '/dashboards/' + encodeURIComponent(config.origName), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      postParentMessage('pbgui_view_saved');
    } catch {
      /* stay dirty on error — legacy parity */
    }
  }

  function serialize(): Record<string, unknown> {
    return { ...state };
  }

  return {
    state,
    epochs,
    autoHeightCells,
    get syncStatus() { return syncStatusRef.value; },
    config,
    get rows() { return rowsComputed.value; },
    get cols() { return colsComputed.value; },
    cellType,
    cellHeight,
    hasStoredHeight,
    isAutoHeight,
    epochOf,
    loadConfig,
    assignCellType,
    clearCell,
    swapCells,
    setLayout,
    setName,
    setCellHeight,
    resetCellHeight,
    rebuildCell,
    scheduleSync,
    doSync,
    markViewDirty,
    saveViewLayout,
    serialize,
    postParentMessage,
  };
}

/* ── singleton ── */

let instance: DashboardStore | null = null;

/** Get the shared store; merges config when provided. */
export function useDashboardStore(config?: Partial<DashboardStoreConfig>): DashboardStore {
  if (!instance) {
    instance = createDashboardStore({ ...DEFAULT_CONFIG, ...config });
  } else if (config) {
    Object.assign(instance.config as DashboardStoreConfig, config);
  }
  return instance;
}

/** Tests only: detach the singleton (pending sync timers die with it). */
export function resetDashboardStore(): void {
  instance = null;
}
