import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInventory, type InventoryApi, type InventoryController } from './useInventory';

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ origin: 'http://pbgui.test:8000', token: 'tok', serial: 'S1', version: '1' })),
}));
import type { PlotlyLike } from '../lib/heatmapFigure';
import type { InventoryPayload } from '../lib/inventoryTypes';
import type { ShowToastFn, TranslateFn } from './useSettings';

/* M-data-6 — the inventory store root (legacy market_data_main.html):
   loadInventoryPanel :8682-8733, renderInventoryMetrics :7851-7866,
   renderInventoryTable :8004-8064, updateInventorySelectionCount
   :8066-8077, select/deselect/toggle :8079-8114, renderInventorySidebarActions
   :8339-8386, syncInventoryMissingToggle :6331-6348, the filter/sort/missing
   bind slices :9357-9380/:9382-9386/:9517-9524, exchange fan-out branch
   :7317-7320. */

const t: TranslateFn = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

const ROWS = [
  { row_id: 'btc', coin: 'BTC', dataset: '1m', n_files: 10, size: 2 },
  { row_id: 'eth', coin: 'ETH', dataset: '1m', n_files: 5, size: 1 },
  { row_id: 'sol', coin: 'SOL', dataset: '1m', n_files: 1, size: 9 },
];

const PAYLOAD: InventoryPayload = {
  success: true,
  view_label: '1m candles',
  helper_note: 'click a row for coverage',
  include_missing_current: false,
  include_missing_supported: false,
  metrics: [{ label: 'Coins', value: '3' }],
  rows: ROWS,
  available_coins: ['BTC', 'ETH', 'SOL'],
};

interface Harness {
  store: InventoryController;
  fetchJson: ReturnType<typeof vi.fn>;
  fetchHeatmapJson: ReturnType<typeof vi.fn>;
  toasts: { message: unknown; level: string }[];
  plotEls: { overview: HTMLElement; minute: HTMLElement };
  plotly: PlotlyLike;
  setExchange(exchange: string): void;
}

function makeHarness(overrides: Partial<{ exchange: string; panelActive: boolean; payload: unknown }> = {}): Harness {
  const toasts: { message: unknown; level: string }[] = [];
  const showToast: ShowToastFn = (message, level = 'info') => void toasts.push({ message, level });
  const fetchJson = vi.fn(async () => overrides.payload ?? PAYLOAD);
  const fetchHeatmapJson = vi.fn(async () => ({ figure: null, legend_html: '', error: 'No Data' }));
  const plotly: PlotlyLike = { newPlot: vi.fn(async () => undefined), purge: vi.fn() };
  const plotEls = { overview: document.createElement('div'), minute: document.createElement('div') };
  let exchange = overrides.exchange ?? 'hyperliquid';
  // the integrity harness cast pattern — vi.fn mocks vs the generic fetchJson<T>
  const api: InventoryApi = {
    fetchJson: fetchJson as unknown as InventoryApi['fetchJson'],
    fetchHeatmapJson: fetchHeatmapJson as unknown as InventoryApi['fetchHeatmapJson'],
  };
  const store = useInventory({
    api,
    t,
    showToast,
    confirm: vi.fn(async () => true),
    getExchange: () => exchange,
    isPanelActive: () => overrides.panelActive ?? true,
    getPlotly: () => plotly,
  });
  store.registerPlot('overview', plotEls.overview);
  store.registerPlot('minute', plotEls.minute);
  return { store, fetchJson, fetchHeatmapJson, toasts, plotEls, plotly, setExchange: (next) => void (exchange = next) };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('loadInventoryPanel (:8682-8733)', () => {
  it('fetches the resolved view with include_missing gated to hyperliquid l2Book (:8690-8692)', async () => {
    const h = makeHarness();
    h.store.getState('hyperliquid', 'l2Book').includeMissingRows = true;
    h.store.setActiveView('l2Book');
    await h.store.loadPanel(false);
    expect(String(h.fetchJson.mock.calls[0]?.[0])).toBe(
      '/inventory/hyperliquid?view=l2Book&include_missing=true'
    );
  });

  it('sends include_missing=false for other views even when the flag is set (:8692)', async () => {
    const h = makeHarness({ exchange: 'hyperliquid' });
    h.store.getState('hyperliquid', '1m').includeMissingRows = true;
    await h.store.loadPanel(false);
    expect(String(h.fetchJson.mock.calls[0]?.[0])).toBe('/inventory/hyperliquid?view=1m&include_missing=false');
  });

  it('applies the payload: title, helper, rows, metrics, no feedback (:8695-8721)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    expect(h.store.title.value).toBe('1m candles');
    expect(h.store.helperNote.value).toBe('click a row for coverage');
    expect(h.store.feedback.value).toEqual({ message: '', level: 'info' });
    expect(h.store.tableRows.value.map((r) => r.row_id)).toEqual(['btc', 'eth', 'sol']); // coin asc default (:6210-6211)
    expect(h.store.metrics.value).toEqual([{ label: 'Coins', value: '3' }]);
  });

  it('falls back to the legacy defaults for title/helper (:8702-8703)', async () => {
    const h = makeHarness({ payload: { success: true, rows: [], metrics: [] } });
    await h.store.loadPanel(false);
    expect(h.store.title.value).toBe('market.ohlcvData');
    expect(h.store.helperNote.value).toBe('market.clickRowHeatmap');
  });

  it('renders the metrics fallback card when the payload has no metrics (:7855-7857)', async () => {
    const h = makeHarness({ payload: { success: true, rows: [], metrics: [] } });
    await h.store.loadPanel(false);
    expect(h.store.metrics.value).toEqual([
      { label: 'market.inventory', value: 'market.unavailable', note: 'market.noInventoryMetrics' },
    ]);
  });

  it('resets the timeframe filter for non-pb7 views (:8706-8707)', async () => {
    const h = makeHarness();
    const state = h.store.getState('hyperliquid', '1m');
    state.timeframeFilter = '1h';
    await h.store.loadPanel(false);
    expect(state.timeframeFilter).toBe('all');
  });

  it('enters the error state for a failed payload (:8722-8731)', async () => {
    const h = makeHarness({ payload: { success: false, error: 'kaput' } });
    await h.store.loadPanel(false);
    expect(h.store.feedback.value).toEqual({ message: 'kaput', level: 'error' });
    expect(h.store.tableError.value).toBe('kaput');
    expect(h.store.metrics.value[0]?.label).toBe('market.inventory');
    expect(h.store.getState('hyperliquid', '1m').payload).toBeNull();
  });

  it('replaces the table with the error text and keeps the stale rows (:8726-8727)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false); // healthy load: 3 rows rendered
    h.store.toggleRow('btc');
    h.fetchJson.mockImplementation(async () => {
      throw new Error('kaput');
    });
    await h.store.loadPanel(false);
    // legacy wrote the error straight into #inventory-table-wrap — the
    // table is gone and the error text renders in its place
    expect(h.store.tableRows.value).toEqual([]);
    expect(h.store.tableEmptyText.value).toBe('kaput');
    // legacy left viewState.rows untouched (no re-render ran) and pruned
    // nothing — the selection survives into the next successful load
    expect(h.store.getState('hyperliquid', '1m').rows).toEqual(ROWS);
    expect(h.store.getState('hyperliquid', '1m').selectedRowIds).toEqual(['btc']);
  });

  it('reports fetch failures with the legacy fallback (:8728-8729)', async () => {
    const h = makeHarness({
      payload: new Promise(() => {
        throw new Error('net down');
      }),
    });
    await h.store.loadPanel(false);
    expect(h.store.feedback.value).toEqual({ message: 'net down', level: 'error' });
  });

  it('ignores a stale load when a newer one started (:8693)', async () => {
    let releaseFirst: ((v: InventoryPayload) => void) | undefined;
    const first = new Promise<InventoryPayload>((resolve) => {
      releaseFirst = resolve;
    });
    const calls: unknown[] = [first, PAYLOAD];
    const h = makeHarness({ payload: null });
    h.fetchJson.mockImplementation(async () => calls.shift() as InventoryPayload);
    const slow = h.store.loadPanel(false);
    const fast = h.store.loadPanel(false);
    releaseFirst?.({ ...PAYLOAD, view_label: 'STALE' });
    await Promise.all([slow, fast]);
    expect(h.store.title.value).toBe('1m candles');
  });
});

describe('table view model (:8004-8064)', () => {
  it('sorts on header toggle and flips direction (:7967-7977)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    expect(h.store.getState('hyperliquid', '1m').sortKey).toBe('coin');
    h.store.toggleSort('n_files');
    const state = h.store.getState('hyperliquid', '1m');
    expect(state.sortKey).toBe('n_files');
    expect(state.sortDirection).toBe('asc');
    expect(h.store.tableRows.value.map((r) => r.row_id)).toEqual(['sol', 'eth', 'btc']);
    h.store.toggleSort('n_files');
    expect(h.store.getState('hyperliquid', '1m').sortDirection).toBe('desc');
    expect(h.store.tableRows.value.map((r) => r.row_id)).toEqual(['btc', 'eth', 'sol']);
  });

  it('falls back to coin/asc when the sort column vanished (:8026-8031)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    const state = h.store.getState('hyperliquid', '1m');
    state.sortKey = 'gone';
    state.sortDirection = 'desc';
    h.store.toggleSort('coin');
    expect(state.sortKey).toBe('coin');
    // the table view model itself also guards (computed re-run)
    expect(h.store.tableRows.value.map((r) => r.row_id)).toEqual(['btc', 'eth', 'sol']);
  });

  it('filters by coin substring (:9357-9363)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.store.setCoinFilter('et');
    expect(h.store.tableRows.value.map((r) => r.row_id)).toEqual(['eth']);
  });

  it('shows the no-match message versus the payload empty message (:8016-8023)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.store.setCoinFilter('zzz');
    expect(h.store.tableEmptyText.value).toBe('market.noRowsMatchFilters');
    const h2 = makeHarness({ payload: { success: true, rows: [], empty_message: 'nothing here', metrics: [] } });
    await h2.store.loadPanel(false);
    expect(h2.store.tableEmptyText.value).toBe('nothing here');
  });

  it('falls back to noDataFound without a payload message (:8019)', async () => {
    const h = makeHarness({ payload: { success: true, rows: [], metrics: [] } });
    await h.store.loadPanel(false);
    expect(h.store.tableEmptyText.value).toBe('market.noDataFound');
  });

  it('prunes the selection when filters remove rows (:8012-8014)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.store.getState('hyperliquid', '1m').selectedRowIds = ['btc', 'eth'];
    h.store.setCoinFilter('btc');
    expect(h.store.getState('hyperliquid', '1m').selectedRowIds).toEqual(['btc']);
  });
});

describe('selection (:8066-8114)', () => {
  it('selects all filtered rows and reloads the heatmap (:8079-8087)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.fetchHeatmapJson.mockClear();
    h.store.setCoinFilter('eth');
    h.store.selectAll();
    expect(h.store.getState('hyperliquid', '1m').selectedRowIds).toEqual(['eth']);
    expect(h.fetchHeatmapJson).toHaveBeenCalled();
  });

  it('deselects all and clears the heatmap (:8089-8095)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.store.selectAll();
    h.store.deselectAll();
    expect(h.store.getState('hyperliquid', '1m').selectedRowIds).toEqual([]);
    expect(h.store.heatmap.heatmapCaption.value).toBe('market.clickRowHeatmap');
  });

  it('toggles a single row and reloads the heatmap (:8097-8110)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.fetchHeatmapJson.mockClear();
    h.store.toggleRow('btc');
    expect(h.store.getState('hyperliquid', '1m').selectedRowIds).toEqual(['btc']);
    expect(h.fetchHeatmapJson).toHaveBeenCalled();
    h.store.toggleRow('btc');
    expect(h.store.getState('hyperliquid', '1m').selectedRowIds).toEqual([]);
  });

  it('commits drag-selected ids and drops the stale preview (:9498-9506)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.store.getState('hyperliquid', '1m').olderPreview = { success: true };
    h.fetchHeatmapJson.mockClear();
    h.store.commitSelectionIds(['btc', 'sol']);
    const state = h.store.getState('hyperliquid', '1m');
    expect(state.selectedRowIds).toEqual(['btc', 'sol']);
    expect(state.olderPreview).toBeNull();
    // two coins selected → the heatmap hides (:8633-8635), no fetch
    expect(h.fetchHeatmapJson).not.toHaveBeenCalled();
    expect(h.store.heatmap.heatmapCaption.value).toBe('market.heatmapHidden:{"count":2}');
  });

  it('counts selected rows and drives the toolbar buttons (:8066-8077)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    expect(h.store.selectionCountText.value).toBe('market.rowsSelected:{"selected":0,"total":3}');
    expect(h.store.selectAllDisabled.value).toBe(false);
    expect(h.store.deselectAllDisabled.value).toBe(true);
    h.store.selectAll();
    expect(h.store.selectionCountText.value).toBe('market.rowsSelected:{"selected":3,"total":3}');
    expect(h.store.selectAllDisabled.value).toBe(true);
    expect(h.store.deselectAllDisabled.value).toBe(false);
  });

  it('derives the selected coins (unique, uppercase) and the single row (:6234-6246, :6326-6329)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    expect(h.store.selectedCoins.value).toEqual([]);
    h.store.toggleRow('eth');
    expect(h.store.selectedCoins.value).toEqual(['ETH']);
    expect(h.store.selectedRow.value?.row_id).toBe('eth');
    h.store.toggleRow('btc');
    expect(h.store.selectedCoins.value).toEqual(['BTC', 'ETH']);
    expect(h.store.selectedRow.value).toBeNull(); // two rows → no single row
  });
});

describe('missing-rows toggle (:6331-6348, :9517-9524)', () => {
  it('is supported only for hyperliquid l2Book with payload support', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false); // payload include_missing_supported false
    expect(h.store.missingToggleSupported.value).toBe(false);
    const h2 = makeHarness({
      payload: { ...PAYLOAD, include_missing_supported: true },
    });
    h2.store.setActiveView('l2Book');
    await h2.store.loadPanel(false);
    expect(h2.store.missingToggleSupported.value).toBe(true);
    expect(h2.store.missingTogglePressed.value).toBe(false);
    expect(h2.store.missingToggleText.value).toBe('market.showNoL2bookYet');
  });

  it('flips include, clears selection and forces a reload (:9517-9523)', async () => {
    const h = makeHarness({ payload: { ...PAYLOAD, include_missing_supported: true } });
    h.store.setActiveView('l2Book');
    await h.store.loadPanel(false);
    h.store.selectAll();
    // legacy echoes the effective flag back as include_missing_current (:8696)
    h.fetchJson.mockImplementation(async (path: string) => ({
      ...PAYLOAD,
      include_missing_supported: true,
      include_missing_current: String(path).includes('include_missing=true'),
    }));
    h.store.toggleIncludeMissing();
    const state = h.store.getState('hyperliquid', 'l2Book');
    expect(state.includeMissingRows).toBe(true);
    expect(state.selectedRowIds).toEqual([]);
    expect(h.fetchJson).toHaveBeenCalledWith('/inventory/hyperliquid?view=l2Book&include_missing=true');
  });
});

describe('sidebar actions view model (:8339-8386, :6350-6374)', () => {
  it('labels the build button per selection (:8354-8369)', async () => {
    const h = makeHarness({ exchange: 'bybit' });
    await h.store.loadPanel(false);
    expect(h.store.sidebarBuildText.value).toBe('market.buildBest1m');
    expect(h.store.sidebarBuildVisible.value).toBe(false);
    expect(h.store.sidebarBuildDisabled.value).toBe(true);
    h.store.toggleRow('btc');
    expect(h.store.sidebarBuildText.value).toBe('market.buildBest1mForCoin:{"coin":"BTC"}');
    h.store.toggleRow('eth');
    expect(h.store.sidebarBuildText.value).toBe('market.buildBest1mForCoins:{"count":2}');
    expect(h.store.sidebarBuildVisible.value).toBe(true);
    expect(h.store.sidebarBuildDisabled.value).toBe(false);
  });

  it('labels the l2book queue action on hyperliquid l2Book (:8356-8359, :8366-8368)', async () => {
    const h = makeHarness();
    h.store.setActiveView('l2Book');
    await h.store.loadPanel(false);
    expect(h.store.sidebarBuildText.value).toBe('market.queueL2bookDownload');
    h.store.selectAll();
    expect(h.store.sidebarBuildText.value).toBe('market.queueL2bookForCoins:{"count":3}');
    h.store.deselectAll();
    h.store.toggleRow('sol');
    expect(h.store.sidebarBuildText.value).toBe('market.queueL2bookForCoin:{"coin":"SOL"}');
  });

  it('labels the delete-selected button (:8373-8380)', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    expect(h.store.sidebarDeleteText.value).toBe('market.deleteSelected');
    expect(h.store.sidebarDeleteDisabled.value).toBe(true);
    h.store.toggleRow('eth');
    expect(h.store.sidebarDeleteText.value).toBe('market.deleteCoinName:{"coin":"ETH"}');
    h.store.toggleRow('btc');
    expect(h.store.sidebarDeleteText.value).toBe('market.deleteCoinsCount:{"count":2}');
    expect(h.store.sidebarDeleteDisabled.value).toBe(false);
    expect(h.store.sidebarOlderDisabled.value).toBe(false);
  });

  it('disables the build button while a queue action is in flight (:8413-8416 + :8469)', async () => {
    const h = makeHarness({ exchange: 'bybit' });
    await h.store.loadPanel(false);
    h.store.toggleRow('btc');
    expect(h.store.sidebarBuildDisabled.value).toBe(false);
    let release: ((v: unknown) => void) | undefined;
    const slow = new Promise((resolve) => {
      release = resolve;
    });
    h.fetchJson.mockImplementation(async () => slow);
    const pending = h.store.actions.runBuildBest1m();
    expect(h.store.sidebarBuildDisabled.value).toBe(true); // disabled at :8413
    release?.({ success: true });
    await pending;
    expect(h.store.sidebarBuildDisabled.value).toBe(false); // finally :8469
  });

  it('hides the delete block for pb7_cache and shows the view availability (:6360-6371)', async () => {
    const h = makeHarness();
    h.store.setActiveView('pb7_cache');
    await h.store.loadPanel(false);
    expect(h.store.sidebarDeleteSectionVisible.value).toBe(false);
    expect(h.store.availableViews.value).toEqual(['1m', '1m_api', 'l2Book', 'pb7_cache']);
    const h2 = makeHarness({ exchange: 'bybit' });
    expect(h2.store.availableViews.value).toEqual(['1m', 'pb7_cache']);
    expect(h2.store.subsectionNavVisible.value).toBe(true); // panel active
  });

  it('hides the sidebar nav while another panel is active (:6356-6357)', () => {
    const h = makeHarness({ panelActive: false });
    expect(h.store.subsectionNavVisible.value).toBe(false);
    expect(h.store.sidebarDeleteSectionVisible.value).toBe(false);
  });
});

describe('exchange fan-out (:7317-7320)', () => {
  it('keeps per-exchange view states isolated', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false);
    h.store.toggleRow('btc');
    h.setExchange('bybit');
    h.store.syncSubsectionVisibility();
    await h.store.loadPanel(false);
    expect(h.store.getState('hyperliquid', '1m').selectedRowIds).toEqual(['btc']);
    expect(h.store.getState('bybit', '1m').selectedRowIds).toEqual([]);
  });

  it('resolves an unavailable view when the exchange changes (:6196-6197)', async () => {
    const h = makeHarness();
    h.store.setActiveView('l2Book');
    h.setExchange('bybit');
    h.store.syncSubsectionVisibility();
    expect(h.store.activeView.value).toBe('1m');
    // legacy coerced in memory only (:6196-6197) — the stored key keeps the
    // user's pick until the next explicit setActiveInventoryView (:6379)
    expect(window.localStorage.getItem('market_data_fastapi_inventory_subsection')).toBe('l2Book');
  });
});

describe('timeframe filter (:6306-6324)', () => {
  it('is only rendered for multi-timeframe pb7_cache views', async () => {
    const h = makeHarness();
    await h.store.loadPanel(false); // 1m view
    expect(h.store.timeframeFilterSupported.value).toBe(false);
    const h2 = makeHarness({
      payload: {
        success: true,
        metrics: [],
        rows: [
          { row_id: 'a', coin: 'BTC', dataset: 'pb7_cache', timeframe: '1m' },
          { row_id: 'b', coin: 'ETH', dataset: 'pb7_cache', timeframe: '1h' },
        ],
      },
    });
    h2.store.setActiveView('pb7_cache');
    await h2.store.loadPanel(false);
    expect(h2.store.timeframeFilterSupported.value).toBe(true);
    expect(h2.store.availableTimeframes.value).toEqual(['1h', '1m']); // legacy numeric collator order
    h2.store.setTimeframeFilter('1h');
    expect(h2.store.tableRows.value.map((r) => r.row_id)).toEqual(['b']);
  });
});
