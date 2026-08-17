<script setup lang="ts">
/**
 * One result's open action sections — the per-idx slices of
 * onResultActionsChanged (:6614-6786): the view block (liquidation
 * warning, BE + price overlay + log toggle, PnL + log toggle, drawdown,
 * equity hard-stop, TWE, BTC pair), the analysis/config JSON panels
 * (:6697-6721, PBGuiJsonPanel global with a <pre> fallback) and the
 * plot/fills image lists (:6723-6743).
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PlotlyDiv from './PlotlyDiv.vue';
import TweChart from './TweChart.vue';
import {
  applyPriceOverlay,
  beChartTraces,
  beEmptyMessage,
  chartLayout,
  chartTitle,
  drawdownTraces,
  hardStopChartSpec,
  pnlTraces,
  priceOverlayTrace,
} from '../lib/resultCharts';
import { priceMarketFromOptionValue, priceMarketOptionValue, pricePayloadCoversChart, resultPriceMarkets } from '../lib/resultsModel';
import type { ResultDataApi, ResultsSection } from '../composables/useResults';
import type { BacktestVersion, BeSeries, ParsedCsv, PricePayload } from '../types';

const props = defineProps<{
  section: ResultsSection;
  index: number;
  version: BacktestVersion;
  dataApi: ResultDataApi;
}>();

const { t } = useI18n();
const result = computed(() => props.section.result);
const showView = computed(() => props.section.actions.has('view'));

const be = ref<BeSeries | null>(null);
const beError = ref('');
const fillsCsv = ref<ParsedCsv | null>(null);
const fillsError = ref('');
const hardStopConfig = ref<unknown>(null);

const state = reactive({
  priceMarket: '',
  priceStatus: '',
  priceWarning: false,
  price: null as PricePayload | null,
});

/** _priceRequestSeq (:6791) — a per-section generation counter so a slow
 * price fetch for an abandoned market never overwrites a newer one. */
let priceRequestSeq = 0;

/** Load the shared series for the view block (:6903-6916, :7229-7241). */
async function loadSectionData(): Promise<void> {
  const result_ = result.value;
  if (!showView.value) return;
  void props.dataApi
    .loadBe(result_.path, result_)
    .then((series) => {
      be.value = series;
    })
    .catch((error: unknown) => {
      beError.value = error instanceof Error ? error.message : String(error);
    });
  void props.dataApi
    .loadFills(result_.path, result_)
    .then((csv) => {
      fillsCsv.value = csv;
    })
    .catch((error: unknown) => {
      fillsError.value = error instanceof Error ? error.message : String(error);
    });
  void props.dataApi
    .loadConfig(result_.path, result_)
    .then((config) => {
      hardStopConfig.value = config;
    })
    .catch(() => {
      hardStopConfig.value = {};
    });
}

onMounted(() => {
  void loadSectionData();
  void loadAnalysisJson();
  void loadConfigJson();
  void loadImages();
});
watch(showView, () => void loadSectionData());

/* ── price overlay (renderBEWithSelectedPrice :6838-6895) ── */

const markets = computed(() => resultPriceMarkets(result.value));

function setPriceStatus(text: string, warning: boolean): void {
  state.priceStatus = text;
  state.priceWarning = warning;
}

async function applyPrice(market: { exchange: string; coin: string }, autoSelect: boolean): Promise<void> {
  const series = be.value;
  if (!series || series.time.length === 0) return;
  const candidates = [market];
  if (autoSelect) {
    for (const candidate of markets.value) {
      if (candidate.coin === market.coin && candidate.exchange !== market.exchange) candidates.push(candidate);
    }
  }
  const seq = ++priceRequestSeq; // :6853
  setPriceStatus('Loading close prices...', false);
  const entries = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return { market: candidate, payload: await props.dataApi.loadPrice(result.value.path, candidate, result.value) };
      } catch (error) {
        return { market: candidate, payload: null, error };
      }
    })
  );
  if (seq !== priceRequestSeq) return; // :6884 — superseded, drop the stale response
  let picked = entries[0]!;
  if (autoSelect) {
    const fullCoverage = entries.find((entry) => entry.payload && pricePayloadCoversChart(entry.payload, series));
    const firstAvailable = entries.find((entry) => entry.payload?.available && entry.payload.time?.length);
    picked = fullCoverage ?? firstAvailable ?? picked;
  }
  if (!picked.payload && picked.error) {
    setPriceStatus(`Price unavailable: ${picked.error instanceof Error ? picked.error.message : String(picked.error)}`, true);
    state.price = null;
    return;
  }
  if (picked.market.exchange !== market.exchange) {
    state.priceMarket = priceMarketOptionValue(picked.market);
  }
  const payload = picked.payload;
  if (!(payload?.available && payload.time?.length)) {
    setPriceStatus('No matching PBGui MarketData for this range.', true);
    state.price = null;
    return;
  }
  const covers = pricePayloadCoversChart(payload, series);
  const coverage = covers
    ? 'full chart coverage'
    : `partial: ${String(payload.coverage_start ?? '?').slice(0, 10)} to ${String(payload.coverage_end ?? '?').slice(0, 10)}`;
  setPriceStatus(`${payload.time?.length ?? 0} price points, ${coverage}`, !covers);
  state.price = payload;
}

async function onPriceMarketChange(): Promise<void> {
  const market = priceMarketFromOptionValue(state.priceMarket);
  if (!market) {
    state.price = null;
    return;
  }
  await applyPrice(market, false);
}

watch(
  () => [be.value, markets.value.length],
  async () => {
    if (!markets.value.length || !be.value?.time.length) return;
    state.priceMarket = priceMarketOptionValue(markets.value[0]!);
    await applyPrice(markets.value[0]!, true);
  }
);

/* ── chart specs ── */

const title = computed(() => chartTitle(result.value, fmtDate));
const beTraces = computed(() => (be.value ? beChartTraces(be.value, { isBtc: false }) : []));
const beLayout = computed(() => {
  const layout = chartLayout(title.value, 'Balance');
  return state.price?.available ? applyPriceOverlay(layout, state.price) : layout;
});
const beBtcTraces = computed(() => (be.value ? beChartTraces(be.value, { isBtc: true }) : []));
const ddTraces = computed(() => (be.value ? drawdownTraces(be.value, { isBtc: false }) : []));
const ddBtcTraces = computed(() => (be.value ? drawdownTraces(be.value, { isBtc: true }) : []));
const pnlChartTraces = computed(() => (fillsCsv.value ? pnlTraces(fillsCsv.value, result.value) : []));

const hardStop = computed(() => {
  if (!be.value || !hardStopConfig.value) return null;
  return hardStopChartSpec(props.version, be.value, hardStopConfig.value);
});

/** The liquidation banner's reason list (:6628-6634). */
const liquidationReasons = computed<string[]>(() => {
  const r = result.value;
  const reasons: string[] = [];
  if ((r.drawdown_worst ?? 0) >= 0.95) reasons.push(`drawdown_worst=${fmt(r.drawdown_worst, 4)}`);
  if ((r.equity_balance_diff_neg_max ?? 0) >= 0.95) reasons.push(`eq_bal_diff=${fmt(r.equity_balance_diff_neg_max, 4)}`);
  if ((r.starting_balance ?? 0) > 0 && (r.final_balance ?? 0) < (r.starting_balance ?? 0) * 0.05) {
    reasons.push(`final_bal=${fmt(r.final_balance, 0)}`);
  }
  return reasons;
});

/* ── JSON panels (:6697-6721) ── */

const analysisText = ref('');
const configText = ref('');

async function loadAnalysisJson(): Promise<void> {
  if (!props.section.actions.has('analysis')) return;
  try {
    const payload = await props.dataApi.loadAnalysis(result.value.path, result.value);
    analysisText.value = JSON.stringify(payload, null, 2) ?? '';
  } catch (error) {
    analysisText.value = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function loadConfigJson(): Promise<void> {
  if (!props.section.actions.has('config')) return;
  try {
    const payload = await props.dataApi.loadConfig(result.value.path, result.value);
    configText.value = JSON.stringify(payload, null, 2) ?? '';
  } catch (error) {
    configText.value = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/* ── image sections (:6723-6743) ── */

const plotFiles = ref<string[]>([]);
const fillsFiles = ref<string[]>([]);
const plotFilesError = ref('');
const fillsFilesError = ref('');

async function loadImages(): Promise<void> {
  const r = result.value;
  if (props.section.actions.has('plot')) {
    try {
      plotFiles.value = await props.dataApi.loadFiles(r.path, r, 'plot');
    } catch (error) {
      // legacy renders a red "Failed: msg" (:7574)
      plotFilesError.value = error instanceof Error ? error.message : String(error);
    }
  }
  if (props.section.actions.has('fills')) {
    try {
      fillsFiles.value = await props.dataApi.loadFiles(r.path, r, 'fills');
    } catch (error) {
      fillsFilesError.value = error instanceof Error ? error.message : String(error);
    }
  }
}

function fmt(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(decimals);
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

const bePlot = ref<InstanceType<typeof PlotlyDiv> | null>(null);
const pnlPlot = ref<InstanceType<typeof PlotlyDiv> | null>(null);

/** toggleLogScale (:7206-7210). */
function toggleLog(plot: InstanceType<typeof PlotlyDiv> | null, event: Event): void {
  plot?.relayout({ 'yaxis.type': (event.target as HTMLInputElement).checked ? 'log' : 'linear' });
}
</script>

<template>
  <div>
    <div v-if="showView">
      <div v-if="result.liquidated" data-test="liquidation-warning" style="background: rgba(255, 75, 75, 0.15); color: var(--red); padding: var(--sp-sm) var(--sp-md); border-radius: 4px; margin-bottom: var(--sp-sm); font-weight: 600">
        ⚠ Backtest ended in liquidation ({{ liquidationReasons.join(', ') }})
      </div>

      <!-- 1. Balance & Equity + price overlay (:6636-6652) -->
      <div style="margin-bottom: var(--sp-xs); display: flex; align-items: center; gap: var(--sp-md); flex-wrap: wrap">
        <label class="sb-toggle">
          <input type="checkbox" data-test="be-log-toggle" @change="toggleLog(bePlot, $event)" />
          <span style="font-size: var(--fs-sm)">logarithmic</span>
        </label>
        <label v-if="markets.length" style="font-size: var(--fs-sm); color: var(--text-dim)">
          Price (PBGui MarketData)
          <select v-model="state.priceMarket" class="sb-input" style="max-width: 220px" data-test="price-market" @change="onPriceMarketChange">
            <option v-for="market in markets" :key="market.exchange + market.coin" :value="priceMarketOptionValue(market)">
              {{ market.exchange }} / {{ market.coin }}
            </option>
          </select>
        </label>
        <span
          v-if="markets.length"
          data-test="price-status"
          style="font-size: var(--fs-xs); color: var(--text-dim)"
          :style="{ color: state.priceWarning ? 'var(--orange)' : undefined }"
        >
          {{ state.priceStatus }}
        </span>
      </div>
      <div class="chart-wrap">
        <div v-if="beError" style="color: var(--red); padding: var(--sp-md)">Failed to load BE data: {{ beError }}</div>
        <div v-else-if="be && !be.time.length" style="color: var(--text-dim); padding: var(--sp-md)">{{ beEmptyMessage() }}</div>
        <PlotlyDiv v-else-if="be" ref="bePlot" :plot-id="`be-chart-${index}`" :traces="beTraces" :layout="beLayout" />
      </div>

      <!-- 2. PnL per symbol (:6654-6658) -->
      <div style="margin-bottom: var(--sp-xs)">
        <label class="sb-toggle">
          <input type="checkbox" data-test="pnl-log-toggle" @change="toggleLog(pnlPlot, $event)" />
          <span style="font-size: var(--fs-sm)">logarithmic</span>
        </label>
      </div>
      <div class="chart-wrap">
        <div v-if="fillsError" style="color: var(--red); padding: var(--sp-md)">Failed to load fills: {{ fillsError }}</div>
        <div v-else-if="fillsCsv && pnlChartTraces.length === 0" style="color: var(--text-dim); padding: var(--sp-md)">No fills data</div>
        <PlotlyDiv v-else-if="fillsCsv" ref="pnlPlot" :plot-id="`pnl-chart-${index}`" :traces="pnlChartTraces" :layout="chartLayout(title, 'Net PnL')" />
      </div>

      <!-- 3. Drawdown (:6660-6663) -->
      <div class="chart-wrap">
        <PlotlyDiv v-if="be" :plot-id="`dd-chart-${index}`" :traces="ddTraces" :layout="chartLayout(title, 'Drawdown')" />
      </div>

      <!-- 4. Equity hard-stop drawdown (:6665-6668) -->
      <div class="chart-wrap">
        <div v-if="hardStop?.emptyReason" style="color: var(--text-dim); padding: var(--sp-md)">{{ hardStop.emptyReason }}</div>
        <PlotlyDiv v-else-if="hardStop" :plot-id="`hard-stop-chart-${index}`" :traces="hardStop.traces" :layout="hardStop.layout" />
      </div>

      <!-- 5. TWE (:6670-6682) -->
      <TweChart :chart-id="`twe-chart-${index}`" :csv="fillsCsv" :result="result" />

      <!-- 6. BTC pair when btc_collateral_cap > 0 (:6684-6692) -->
      <template v-if="(result.btc_collateral_cap ?? 0) > 0">
        <div class="chart-wrap">
          <PlotlyDiv v-if="be" :plot-id="`be-btc-chart-${index}`" :traces="beBtcTraces" :layout="chartLayout(title, 'Balance')" />
        </div>
        <div class="chart-wrap">
          <PlotlyDiv v-if="be" :plot-id="`dd-btc-chart-${index}`" :traces="ddBtcTraces" :layout="chartLayout(title, 'Drawdown')" />
        </div>
      </template>
    </div>

    <!-- Analysis JSON (:6697-6708) -->
    <div v-if="section.actions.has('analysis')" class="chart-wrap" data-test="analysis-section">
      <h4 style="margin: var(--sp-sm) 0">{{ t('v7backtest.analysis') }}</h4>
      <pre class="json-pre">{{ analysisText }}</pre>
    </div>

    <!-- Config JSON (:6710-6721) -->
    <div v-if="section.actions.has('config')" class="chart-wrap" data-test="config-section">
      <h4 style="margin: var(--sp-sm) 0">{{ t('v7backtest.configTitle') }}</h4>
      <pre class="json-pre">{{ configText }}</pre>
    </div>

    <!-- Plot images (:6723-6732) — literal strings, like the legacy -->
    <div v-if="section.actions.has('plot')" class="chart-wrap" data-test="plot-section" style="margin-top: var(--sp-md)">
      <div style="padding: var(--sp-md)">
        <div v-if="plotFilesError" style="color: var(--red)">Failed: {{ plotFilesError }}</div>
        <div v-else-if="plotFiles.length === 0" style="color: var(--text-dim)">No plot images found</div>
        <img
          v-for="file in plotFiles"
          :key="file"
          :src="dataApi.imageUrl(result.path, result, file)"
          :alt="file"
          style="width: 100%; margin-bottom: var(--sp-sm); border-radius: 4px"
          @error="($event.target as HTMLElement).style.display = 'none'"
        />
      </div>
    </div>

    <!-- Fills plots (:6734-6743) -->
    <div v-if="section.actions.has('fills')" class="chart-wrap" data-test="fills-section" style="margin-top: var(--sp-md)">
      <div style="padding: var(--sp-md)">
        <div v-if="fillsFilesError" style="color: var(--red)">Failed: {{ fillsFilesError }}</div>
        <div v-else-if="fillsFiles.length === 0" style="color: var(--text-dim)">No fills plots found</div>
        <img
          v-for="file in fillsFiles"
          :key="file"
          :src="dataApi.imageUrl(result.path, result, file)"
          :alt="file"
          style="width: 100%; margin-bottom: var(--sp-sm); border-radius: 4px"
          @error="($event.target as HTMLElement).style.display = 'none'"
        />
      </div>
    </div>
  </div>
</template>
