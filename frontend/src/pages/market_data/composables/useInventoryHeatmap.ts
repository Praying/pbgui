import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { marketDataApiBase } from '../config';
import { applyPlotlyFigure, clearPlotlyTarget, type PlotlyLike } from '../lib/heatmapFigure';
import { parseHeatmapLegend, type HeatmapLegendItem } from '../lib/heatmapLegend';
import { buildOhlcvFrameUrl, heatmapInfoPath, heatmapMinutesPath, heatmapOverviewPath } from '../lib/inventoryUrls';
import { getInventoryCoinDisplayName } from '../lib/inventoryColumns';
import type {
  HeatmapFigurePayload,
  HeatmapInfo,
  InventoryFeedback,
  InventoryRow,
} from '../lib/inventoryTypes';
import type { InventoryViewState } from './useInventoryViewState';
import type { TranslateFn } from './useSettings';

/*
 * M-data-6 — the heatmap column (legacy market_data_main.html):
 *
 *   clearInventoryPlot          :8474-8485  (lib/heatmapFigure)
 *   applyPlotlyFigure           :8487-8498  (lib/heatmapFigure, hardened
 *                                            purge-before-replace)
 *   clearInventoryHeatmap       :8500-8523
 *   renderInventoryHeatmapControls :8525-8555
 *   syncInventoryOhlcvFrame     :8557-8583
 *   loadInventoryMinuteHeatmap  :8585-8629
 *   loadInventoryHeatmap        :8631-8680
 *
 * Deviation (documented): legacy injected the server legend_html with
 * innerHTML (:8664/:8616); the port parses it (lib/heatmapLegend) and
 * renders structured items with bound styles — no v-html on server data.
 */

export type InventoryPlotKey = 'overview' | 'minute';

export interface UseInventoryHeatmapOptions {
  api: { fetchHeatmapJson<T>(path: string, init?: RequestInit): Promise<T> };
  t: TranslateFn;
  getExchange(): string;
  getViewState(): InventoryViewState;
  getSelectedRow(): InventoryRow | null;
  getSelectedCoinCount(): number;
  getPlotly(): PlotlyLike | undefined;
  getPlotEl(key: InventoryPlotKey): HTMLElement | undefined;
}

export interface InventoryHeatmapController {
  /* render state */
  heatmapTitle: Ref<string>;
  heatmapCaption: Ref<string>;
  heatmapFeedback: Ref<InventoryFeedback>;
  toolbarVisible: ComputedRef<boolean>;
  monthFieldVisible: ComputedRef<boolean>;
  holidayToggleVisible: ComputedRef<boolean>;
  oosToggleVisible: ComputedRef<boolean>;
  months: Ref<string[]>;
  overviewLegend: Ref<HeatmapLegendItem[]>;
  minuteLegend: Ref<HeatmapLegendItem[]>;
  minuteShellVisible: Ref<boolean>;

  /* ohlcv details (:8557-8583) */
  ohlcvVisible: Ref<boolean>;
  ohlcvOpen: Ref<boolean>;
  ohlcvSummary: Ref<string>;
  ohlcvFrameSrc: ComputedRef<string>;

  /* actions */
  loadHeatmap(): Promise<void>;
  clearHeatmap(message?: string): void;
  syncOhlcvFrame(): void;
  setMonth(month: string): void;
  setShowHoliday(value: boolean): void;
  setShowOos(value: boolean): void;
  toggleOhlcv(open: boolean): void;
}

function monthsOf(info: HeatmapInfo | null): string[] {
  return Array.isArray(info?.months) ? info.months.map((month) => String(month)) : [];
}

export function useInventoryHeatmap(options: UseInventoryHeatmapOptions): InventoryHeatmapController {
  const { api, t, getExchange, getViewState, getSelectedRow, getSelectedCoinCount, getPlotly, getPlotEl } = options;

  let heatmapRequestId = 0; // inventoryState.heatmapRequestId

  const heatmapTitle = ref(t('market.heatmap'));
  const heatmapCaption = ref(t('market.clickRowHeatmap'));
  const heatmapFeedback = ref<InventoryFeedback>({ message: '', level: 'info' });
  const months = ref<string[]>([]);
  const overviewLegend = ref<HeatmapLegendItem[]>([]);
  const minuteLegend = ref<HeatmapLegendItem[]>([]);
  const minuteShellVisible = ref(false);

  const hasMinuteView = ref(false); // info.is_candles && months.length (:8533)
  const isStockPerp = ref(false); // info.is_stock_perp && hasMinuteView (:8534)

  const ohlcvVisible = ref(false);
  const ohlcvOpen = ref(false);
  const ohlcvSummary = ref(t('market.ohlcvChart'));
  const ohlcvPendingSrc = ref(''); // frame.dataset.src (:8576-8582)

  const toolbarVisible = computed(() => hasMinuteView.value || isStockPerp.value); // :8536
  const monthFieldVisible = computed(() => hasMinuteView.value); // :8537
  const holidayToggleVisible = computed(() => isStockPerp.value); // :8538
  const oosToggleVisible = computed(() => isStockPerp.value); // :8539

  const ohlcvFrameSrc = computed(() => (ohlcvVisible.value && ohlcvOpen.value ? ohlcvPendingSrc.value : ''));

  function clearPlot(key: InventoryPlotKey, message: string): void {
    const el = getPlotEl(key);
    if (el) clearPlotlyTarget(el, getPlotly(), message); // :8510-8511
  }

  /** clearInventoryHeatmap (:8500-8523). */
  function clearHeatmap(message = ''): void {
    const text = message || t('market.clickRowHeatmap'); // :8502
    heatmapTitle.value = t('market.heatmap'); // :8501
    heatmapCaption.value = text;
    hasMinuteView.value = false;
    isStockPerp.value = false;
    months.value = [];
    overviewLegend.value = [];
    minuteLegend.value = [];
    minuteShellVisible.value = false;
    clearPlot('overview', text); // :8510
    clearPlot('minute', t('market.noMinuteHeatmap')); // :8511
    heatmapFeedback.value = { message: '', level: 'info' }; // :8512
    const viewState = getViewState();
    viewState.heatmapInfo = null;
    ohlcvVisible.value = false; // :8513-8517
    ohlcvOpen.value = false;
    ohlcvPendingSrc.value = ''; // :8519-8521
  }

  /** renderInventoryHeatmapControls (:8525-8555). */
  function renderHeatmapControls(info: HeatmapInfo): void {
    const viewState = getViewState();
    const list = monthsOf(info);
    hasMinuteView.value = Boolean(info?.is_candles && list.length); // :8533
    isStockPerp.value = Boolean(info?.is_stock_perp && hasMinuteView.value); // :8534
    if (hasMinuteView.value) {
      if (!list.includes(viewState.selectedMonth)) {
        viewState.selectedMonth = list[list.length - 1] ?? ''; // :8542-8544
      }
      months.value = list; // :8545-8547
    } else {
      months.value = [];
    }
  }

  /** syncInventoryOhlcvFrame (:8557-8583). */
  function syncOhlcvFrame(): void {
    const row = getSelectedRow();
    const dataset = String(row?.dataset ?? '').toLowerCase(); // :8562
    if (!row || dataset === 'l2book' || dataset === 'l2book_mid') {
      ohlcvVisible.value = false; // :8564-8569
      ohlcvOpen.value = false;
      ohlcvPendingSrc.value = '';
      return;
    }
    ohlcvSummary.value = t('market.ohlcvChartCoin', { coin: getInventoryCoinDisplayName(row.coin) }); // :8571
    ohlcvVisible.value = true; // :8572
    ohlcvPendingSrc.value = buildOhlcvFrameUrl(
      marketDataApiBase(),
      getExchange(),
      String(row.dataset ?? ''),
      String(row.coin ?? '')
    ); // :8573-8575
  }

  /** The <details> toggle (:9580-9586) — lazy src application. */
  function toggleOhlcv(open: boolean): void {
    ohlcvOpen.value = open;
  }

  /** loadInventoryMinuteHeatmap (:8585-8629). */
  async function loadMinuteHeatmap(row: InventoryRow, info: HeatmapInfo, requestId: number): Promise<void> {
    const viewState = getViewState();
    const list = monthsOf(info);
    if (!info?.is_candles || !list.length) {
      minuteShellVisible.value = false; // :8591-8594
      minuteLegend.value = [];
      clearPlot('minute', t('market.noMinuteHeatmap'));
      return;
    }
    let month = viewState.selectedMonth;
    if (!list.includes(month)) {
      month = list[list.length - 1] ?? ''; // :8597-8599
      viewState.selectedMonth = month;
    }
    if (!month) {
      minuteShellVisible.value = false; // :8601-8603
      return;
    }

    try {
      const payload = await api.fetchHeatmapJson<HeatmapFigurePayload>(
        heatmapMinutesPath(
          getExchange(),
          String(row.dataset ?? ''),
          String(row.coin ?? ''),
          month,
          viewState.showHoliday !== false,
          viewState.showOos !== false
        )
      ); // :8607-8612
      if (requestId !== heatmapRequestId) return; // :8613
      if (payload.error || !payload.figure) {
        minuteShellVisible.value = true; // :8615 — shell shown with the error
        minuteLegend.value = parseHeatmapLegend(payload.legend_html); // :8616
        clearPlot('minute', payload.error || t('market.noMinuteHeatmapMonth')); // :8617
        return;
      }
      minuteShellVisible.value = true; // :8620
      minuteLegend.value = parseHeatmapLegend(payload.legend_html); // :8621
      const el = getPlotEl('minute');
      if (el) await applyPlotlyFigure(el, getPlotly(), payload.figure); // :8622
    } catch (error) {
      if (requestId !== heatmapRequestId) return; // :8624
      minuteShellVisible.value = true; // :8625
      minuteLegend.value = [];
      const message = error instanceof Error && error.message ? serverMsg(error.message) : t('market.failedLoadMinuteHeatmap');
      clearPlot('minute', message); // :8627
    }
  }

  /** loadInventoryHeatmap (:8631-8680). */
  async function loadHeatmap(): Promise<void> {
    const selectedCount = getSelectedCoinCount();
    if (selectedCount > 1) {
      clearHeatmap(t('market.heatmapHidden', { count: selectedCount })); // :8633-8635
      return;
    }
    const row = getSelectedRow();
    if (!row) {
      clearHeatmap(t('market.clickRowHeatmap')); // :8637-8640
      return;
    }

    const requestId = ++heatmapRequestId; // :8643
    const viewState = getViewState();
    const coinLabel = getInventoryCoinDisplayName(row.coin); // :8645
    heatmapTitle.value = `${String(row.dataset ?? '')} / ${coinLabel}`; // :8646
    heatmapCaption.value = t('market.loadingHeatmapFor', { coin: coinLabel }); // :8647
    heatmapFeedback.value = { message: t('market.loadingHeatmap'), level: 'info' }; // :8648

    try {
      const info = await api.fetchHeatmapJson<HeatmapInfo>(
        heatmapInfoPath(getExchange(), String(row.dataset ?? ''), String(row.coin ?? ''))
      ); // :8651-8653
      if (requestId !== heatmapRequestId) return; // :8654
      viewState.heatmapInfo = info;
      renderHeatmapControls(info); // :8656
      syncOhlcvFrame(); // :8657

      const overview = await api.fetchHeatmapJson<HeatmapFigurePayload>(
        heatmapOverviewPath(getExchange(), String(row.dataset ?? ''), String(row.coin ?? ''))
      ); // :8659-8661
      if (requestId !== heatmapRequestId) return; // :8662
      if (overview.error || !overview.figure) {
        overviewLegend.value = parseHeatmapLegend(overview.legend_html); // :8664
        clearPlot('overview', overview.error || t('market.noOverviewHeatmap')); // :8665
      } else {
        overviewLegend.value = parseHeatmapLegend(overview.legend_html); // :8667
        const el = getPlotEl('overview');
        if (el) await applyPlotlyFigure(el, getPlotly(), overview.figure); // :8668
      }

      heatmapCaption.value = t('market.heatmapFor', {
        dataset: String(row.dataset ?? ''),
        coin: coinLabel,
      }); // :8671
      heatmapFeedback.value = { message: '', level: 'info' }; // :8672
      await loadMinuteHeatmap(row, info, requestId); // :8673
    } catch (error) {
      if (requestId !== heatmapRequestId) return; // :8675
      const message =
        error instanceof Error && error.message ? serverMsg(error.message) : t('market.failedLoadHeatmap');
      heatmapFeedback.value = { message, level: 'error' }; // :8676
      clearPlot('overview', message); // :8677
      minuteShellVisible.value = false; // :8678
    }
  }

  /** Month select change (:9565-9568) — full reload like legacy. */
  function setMonth(month: string): void {
    getViewState().selectedMonth = String(month ?? '');
    void loadHeatmap();
  }

  /** Holiday toggle (:9570-9573). */
  function setShowHoliday(value: boolean): void {
    getViewState().showHoliday = value;
    void loadHeatmap();
  }

  /** OOS toggle (:9575-9578). */
  function setShowOos(value: boolean): void {
    getViewState().showOos = value;
    void loadHeatmap();
  }

  return {
    heatmapTitle,
    heatmapCaption,
    heatmapFeedback,
    toolbarVisible,
    monthFieldVisible,
    holidayToggleVisible,
    oosToggleVisible,
    months,
    overviewLegend,
    minuteLegend,
    minuteShellVisible,
    ohlcvVisible,
    ohlcvOpen,
    ohlcvSummary,
    ohlcvFrameSrc,
    loadHeatmap,
    clearHeatmap,
    syncOhlcvFrame,
    setMonth,
    setShowHoliday,
    setShowOos,
    toggleOhlcv,
  };
}
