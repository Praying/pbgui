import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { useInventoryHeatmap, type InventoryHeatmapController } from './useInventoryHeatmap';

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ origin: 'http://pbgui.test:8000', token: 'tok', serial: 'S1', version: '1' })),
}));
import { createInventoryViewState } from './useInventoryViewState';
import type { PlotlyLike } from '../lib/heatmapFigure';
import type { HeatmapFigurePayload, HeatmapInfo, InventoryRow } from '../lib/inventoryTypes';

/* M-data-6 — legacy heatmap core (market_data_main.html):
   clearInventoryPlot/applyPlotlyFigure :8474-8498, clearInventoryHeatmap
   :8500-8523, renderInventoryHeatmapControls :8525-8555,
   syncInventoryOhlcvFrame :8557-8583, loadInventoryMinuteHeatmap
   :8585-8629, loadInventoryHeatmap :8631-8680. */

const t = (key: string, params?: Record<string, unknown>): string =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const ROW: InventoryRow = { row_id: 'r1', coin: 'XYZ:TSLA', dataset: '1m' };
const INFO: HeatmapInfo = { is_candles: true, is_stock_perp: true, months: ['2024-05', '2024-06'] };
const OVERVIEW: HeatmapFigurePayload = {
  figure: JSON.stringify({ data: [{ type: 'bar' }], layout: { height: 200 } }),
  legend_html: "<span style='background:#b23b3b;'>missing</span>",
  error: null,
};
const MINUTES: HeatmapFigurePayload = {
  figure: JSON.stringify({ data: [{ type: 'heatmap' }], layout: {} }),
  legend_html: "<span style='background:#7e57c2;'>api</span>",
  error: null,
};

function makePlotly(): PlotlyLike {
  return {
    newPlot: vi.fn(async () => undefined),
    purge: vi.fn(),
  };
}

interface Harness {
  controller: InventoryHeatmapController;
  viewState: ReturnType<typeof createInventoryViewState>;
  plotly: PlotlyLike;
  els: { overview: HTMLElement; minute: HTMLElement };
  heatmapFetch: ReturnType<typeof vi.fn>;
}

function makeHarness(overrides: Partial<{
  fetchHeatmapJson: ReturnType<typeof vi.fn>;
  selectedRow: InventoryRow | null;
  selectedCoinCount: number;
}> = {}): Harness {
  const viewState = reactive(createInventoryViewState());
  const plotly = makePlotly();
  const els = { overview: document.createElement('div'), minute: document.createElement('div') };
  const heatmapFetch =
    overrides.fetchHeatmapJson ??
    vi.fn(async (path: string) => {
      if (path.startsWith('/info')) return { ...INFO };
      if (path.startsWith('/overview')) return { ...OVERVIEW };
      if (path.startsWith('/minutes')) return { ...MINUTES };
      throw new Error('unexpected path ' + path);
    });
  const controller = useInventoryHeatmap({
    api: { fetchHeatmapJson: heatmapFetch },
    t,
    getExchange: () => 'hyperliquid',
    getViewState: () => viewState,
    getSelectedRow: () => (overrides.selectedRow !== undefined ? overrides.selectedRow : ROW),
    getSelectedCoinCount: () => overrides.selectedCoinCount ?? 1,
    getPlotly: () => plotly,
    getPlotEl: (key) => els[key],
  });
  return { controller, viewState, plotly, els, heatmapFetch };
}

describe('clearHeatmap (:8500-8523)', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
    h.viewState.heatmapInfo = INFO;
  });

  it('resets title, caption, toolbar, legends, minute shell and feedback', () => {
    h.controller.minuteShellVisible.value = true;
    h.controller.clearHeatmap('pick one');
    expect(h.controller.heatmapTitle.value).toBe('market.heatmap');
    expect(h.controller.heatmapCaption.value).toBe('pick one');
    expect(h.controller.toolbarVisible.value).toBe(false);
    expect(h.controller.monthFieldVisible.value).toBe(false);
    expect(h.controller.holidayToggleVisible.value).toBe(false);
    expect(h.controller.oosToggleVisible.value).toBe(false);
    expect(h.controller.overviewLegend.value).toEqual([]);
    expect(h.controller.minuteLegend.value).toEqual([]);
    expect(h.controller.minuteShellVisible.value).toBe(false);
    expect(h.controller.heatmapFeedback.value.message).toBe('');
    expect(h.viewState.heatmapInfo).toBeNull();
  });

  it('defaults the caption to clickRowHeatmap (:8502)', () => {
    h.controller.clearHeatmap('');
    expect(h.controller.heatmapCaption.value).toBe('market.clickRowHeatmap');
  });

  it('clears the plots and the ohlcv frame (:8510-8522)', () => {
    (h.els.overview as HTMLElement & { data?: unknown[] }).data = [];
    h.controller.clearHeatmap('m');
    expect(h.plotly.purge).toHaveBeenCalledWith(h.els.overview);
    expect(h.els.overview.textContent).toContain('m');
    expect(h.els.minute.textContent).toContain('market.noMinuteHeatmap');
    expect(h.controller.ohlcvVisible.value).toBe(false);
    expect(h.controller.ohlcvOpen.value).toBe(false);
    expect(h.controller.ohlcvFrameSrc.value).toBe('');
  });
});

describe('loadHeatmap (:8631-8680)', () => {
  it('clears with the hidden message when more than one coin is selected (:8633-8635)', async () => {
    const h = makeHarness({ selectedCoinCount: 3 });
    await h.controller.loadHeatmap();
    expect(h.heatmapFetch).not.toHaveBeenCalled();
    expect(h.controller.heatmapCaption.value).toBe('market.heatmapHidden:{"count":3}');
  });

  it('clears with the helper note when nothing is selected (:8637-8640)', async () => {
    const h = makeHarness({ selectedRow: null, selectedCoinCount: 0 });
    await h.controller.loadHeatmap();
    expect(h.heatmapFetch).not.toHaveBeenCalled();
    expect(h.controller.heatmapCaption.value).toBe('market.clickRowHeatmap');
  });

  it('loads info → overview → minutes for the single selected row', async () => {
    const h = makeHarness();
    await h.controller.loadHeatmap();
    const paths = h.heatmapFetch.mock.calls.map((c) => String(c[0]));
    expect(paths).toEqual([
      '/info?exchange=hyperliquid&dataset=1m&coin=XYZ%3ATSLA',
      '/overview?exchange=hyperliquid&dataset=1m&coin=XYZ%3ATSLA',
      '/minutes?exchange=hyperliquid&dataset=1m&coin=XYZ%3ATSLA&month=2024-06&show_holiday=true&show_oos=true',
    ]);
    expect(h.controller.heatmapTitle.value).toBe('1m / TSLA'); // :8646
    expect(h.controller.heatmapCaption.value).toBe('market.heatmapFor:{"dataset":"1m","coin":"TSLA"}'); // :8671
    expect(h.controller.heatmapFeedback.value.message).toBe('');
    expect(h.viewState.heatmapInfo).toEqual(INFO);
  });

  it('renders the toolbar from the info payload (:8536-8539) and defaults the month to the last (:8543)', async () => {
    const h = makeHarness();
    await h.controller.loadHeatmap();
    expect(h.controller.toolbarVisible.value).toBe(true);
    expect(h.controller.monthFieldVisible.value).toBe(true);
    expect(h.controller.holidayToggleVisible.value).toBe(true);
    expect(h.controller.oosToggleVisible.value).toBe(true);
    expect(h.controller.months.value).toEqual(['2024-05', '2024-06']);
    expect(h.viewState.selectedMonth).toBe('2024-06');
  });

  it('hides the toolbar for a non-candles dataset (:8533, :8590-8595)', async () => {
    const h = makeHarness({
      fetchHeatmapJson: vi.fn(async (path: string) => {
        if (path.startsWith('/info')) return { is_candles: false, is_stock_perp: false, months: [] };
        if (path.startsWith('/overview')) return { ...OVERVIEW };
        throw new Error('unexpected ' + path);
      }),
    });
    await h.controller.loadHeatmap();
    expect(h.controller.toolbarVisible.value).toBe(false);
    expect(h.controller.minuteShellVisible.value).toBe(false);
    expect(h.heatmapFetch).toHaveBeenCalledTimes(2); // no /minutes call
    expect(h.els.minute.textContent).toContain('market.noMinuteHeatmap');
  });

  it('applies the server figures to both plots and parses the legends', async () => {
    const h = makeHarness();
    await h.controller.loadHeatmap();
    expect(h.plotly.newPlot).toHaveBeenCalledWith(h.els.overview, [{ type: 'bar' }], { height: 200 }, expect.anything());
    expect(h.plotly.newPlot).toHaveBeenCalledWith(h.els.minute, [{ type: 'heatmap' }], {}, expect.anything());
    expect(h.controller.overviewLegend.value).toEqual([{ label: 'missing', color: '#b23b3b' }]);
    expect(h.controller.minuteLegend.value).toEqual([{ label: 'api', color: '#7e57c2' }]);
    expect(h.controller.minuteShellVisible.value).toBe(true);
  });

  it('shows the overview error and keeps the legend when the figure is missing (:8663-8665)', async () => {
    const h = makeHarness({
      fetchHeatmapJson: vi.fn(async (path: string) => {
        if (path.startsWith('/info')) return { ...INFO };
        if (path.startsWith('/overview')) {
          return { figure: null, legend_html: "<span style='background:#b23b3b;'>missing</span>", error: 'No data' };
        }
        throw new Error('unexpected ' + path);
      }),
    });
    await h.controller.loadHeatmap();
    expect(h.plotly.newPlot).not.toHaveBeenCalled();
    expect(h.els.overview.textContent).toContain('No data');
    expect(h.controller.overviewLegend.value).toEqual([{ label: 'missing', color: '#b23b3b' }]);
    expect(h.controller.heatmapCaption.value).toBe('market.heatmapFor:{"dataset":"1m","coin":"TSLA"}');
  });

  it('ignores stale responses after a newer load started (:8654, :8662)', async () => {
    let releaseInfo: ((v: HeatmapInfo) => void) | undefined;
    const slowInfo = new Promise<HeatmapInfo>((resolve) => {
      releaseInfo = resolve;
    });
    let call = 0;
    const h = makeHarness({
      fetchHeatmapJson: vi.fn(async () => {
        call += 1;
        return call === 1 ? slowInfo : Promise.resolve({ is_candles: false, is_stock_perp: false, months: [] });
      }),
    });
    const first = h.controller.loadHeatmap();
    const second = h.controller.loadHeatmap(); // bumps heatmapRequestId
    releaseInfo?.({ ...INFO }); // the stale load's info lands last
    await Promise.all([first, second]);
    expect(h.viewState.heatmapInfo).toEqual({ is_candles: false, is_stock_perp: false, months: [] }); // stale info dropped
    expect(h.plotly.newPlot).not.toHaveBeenCalled(); // no overview fetch ran for the stale load
  });

  it('reports fetch failures through the feedback box and clears the overview (:8674-8679)', async () => {
    const h = makeHarness({
      fetchHeatmapJson: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await h.controller.loadHeatmap();
    expect(h.controller.heatmapFeedback.value).toEqual({ message: 'boom', level: 'error' });
    expect(h.els.overview.textContent).toContain('boom');
    expect(h.controller.minuteShellVisible.value).toBe(false);
  });

  it('reuses a still-valid selected month (:8596-8599)', async () => {
    const h = makeHarness();
    h.viewState.selectedMonth = '2024-05';
    await h.controller.loadHeatmap();
    expect(String(h.heatmapFetch.mock.calls[2]?.[0])).toContain('month=2024-05');
  });

  it('passes the holiday/oos toggles through (:8611-8612)', async () => {
    const h = makeHarness();
    h.viewState.showHoliday = false;
    h.viewState.showOos = false;
    await h.controller.loadHeatmap();
    expect(String(h.heatmapFetch.mock.calls[2]?.[0])).toContain('show_holiday=false&show_oos=false');
  });
});

describe('minute month setters (:9565-9573)', () => {
  it('sets the month and reloads the full heatmap', async () => {
    const h = makeHarness();
    await h.controller.loadHeatmap();
    h.heatmapFetch.mockClear();
    h.controller.setMonth('2024-05');
    await Promise.resolve();
    await vi.waitFor(() => expect(h.heatmapFetch).toHaveBeenCalled());
    expect(h.viewState.selectedMonth).toBe('2024-05');
  });

  it('flips holiday and reloads (:9570-9573)', async () => {
    const h = makeHarness();
    await h.controller.loadHeatmap();
    h.heatmapFetch.mockClear();
    h.controller.setShowHoliday(false);
    await vi.waitFor(() => expect(h.heatmapFetch).toHaveBeenCalled());
    expect(h.viewState.showHoliday).toBe(false);
  });
});

describe('syncOhlcvFrame (:8557-8583)', () => {
  it('hides the frame for l2book datasets (:8564-8569)', async () => {
    const h = makeHarness({ selectedRow: { row_id: 'r', coin: 'BTC', dataset: 'l2book' } });
    await h.controller.loadHeatmap();
    expect(h.controller.ohlcvVisible.value).toBe(false);
    expect(h.controller.ohlcvFrameSrc.value).toBe('');
  });

  it('hides the frame for l2book_mid datasets', async () => {
    const h = makeHarness({ selectedRow: { row_id: 'r', coin: 'BTC', dataset: 'l2Book_Mid' } });
    await h.controller.loadHeatmap();
    expect(h.controller.ohlcvVisible.value).toBe(false);
  });

  it('shows the summary for candle datasets but only loads the iframe when open (:8571-8582)', async () => {
    const h = makeHarness();
    await h.controller.loadHeatmap();
    expect(h.controller.ohlcvVisible.value).toBe(true);
    expect(h.controller.ohlcvSummary.value).toBe('market.ohlcvChartCoin:{"coin":"TSLA"}');
    expect(h.controller.ohlcvFrameSrc.value).toBe(''); // details closed → no src
    h.controller.toggleOhlcv(true);
    expect(h.controller.ohlcvFrameSrc.value).toBe(
      'http://pbgui.test:8000/api/market-data/inventory/chart/ohlcv?exchange=hyperliquid&dataset=1m&coin=XYZ%3ATSLA'
    );
    h.controller.toggleOhlcv(false);
    expect(h.controller.ohlcvFrameSrc.value).toBe('');
  });
});
