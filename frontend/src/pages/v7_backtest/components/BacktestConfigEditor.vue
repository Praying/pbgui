<script setup lang="ts">
import { PhCaretRight, PhFolderOpen, PhMinus, PhPlus } from '@phosphor-icons/vue';
import { computed, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import DatePicker from '@/shared/datepicker/DatePicker.vue';
import KvCoinSources from '@/shared/kvCoinSources/KvCoinSources.vue';
import SuiteEditor from '@/shared/suiteEditor/SuiteEditor.vue';
import type { SuiteState } from '@/shared/suiteEditor/suiteModel';
import CoinOverridesPanel from '@/shared/coinOverrides/components/CoinOverridesPanel.vue';
import type { CoinOverridesStore } from '@/shared/coinOverrides/useCoinOverrides';
import AdvancedFieldsPanel from './AdvancedFieldsPanel.vue';
import BotSideEditor from './BotSideEditor.vue';
import CoinMultiSelect from './CoinMultiSelect.vue';
import { EXTRA_BT_META } from '../lib/backtestFormModel';
import type { BacktestFormState } from '../lib/backtestFormModel';
import type { MarketSettingsState, ResultMetricsState } from '../lib/advancedFields';

/**
 * BacktestConfigEditor — the structured form of showConfigEditor
 * (:2563-2946): identity/time row, balance row, fees/controls row, data
 * source row, coin_sources + market_settings_sources chip editors, coins
 * & filters, the coin-overrides embed (:2927), the suite embed (:2915),
 * bot long/short (:2816-2870), the additional-params expander (:2186)
 * and the raw JSON expander (:2879-2892). The parent (useConfigEditor)
 * owns the state objects; this component only binds fields.
 */

const props = withDefaults(
  defineProps<{
    state: BacktestFormState;
    isV8: boolean;
    /** settings.hsl_signal_modes + exchange_options. */
    hslModes: readonly string[];
    exchangeOptions: readonly string[];
    /** suite editor state (suiteInit/suiteLoad, :2915-2916). */
    suite: SuiteState;
    suiteExchanges: readonly string[];
    availableCoins: readonly string[];
    botParams: readonly string[];
    coinOv: CoinOverridesStore;
    marketSettings: MarketSettingsState;
    resultMetrics: ResultMetricsState;
    marketCoins: readonly string[];
    /** loadCfgSymbols options (:3735-3790). */
    coinOptions: readonly string[];
    coinLabels: Record<string, string>;
    tagOptions: readonly string[];
    /** Validation surfaces owned by the parent. */
    rawErrorLine?: number | null;
    longErrorLine?: number | null;
    shortErrorLine?: number | null;
    paramStatus: { long: Record<string, string>; short: Record<string, string> };
    loadSymbols(exchange: string): Promise<{ symbols: string[]; catalog?: Record<string, string> }>;
    applyFilters(): void;
    fillPbguiDataPath(): void;
  }>(),
  { rawErrorLine: null, longErrorLine: null, shortErrorLine: null }
);

const emit = defineEmits<{
  'update:suite': [value: SuiteState];
  'template-exchanges': [exchanges: string[]];
  'change': [];
}>();

const { t } = useI18n();

const coinOptionsWithoutAll = computed(() => props.coinOptions.filter((option) => option !== 'all'));
const coinSourcesOpen = ref(false);
const marketSourcesOpen = ref(false);
const additionalOpen = ref(false);
const rawJsonOpen = ref(false);
const advancedExecutionOpen = ref(false);

const exchangesOptions = computed(() => {
  const options = props.exchangeOptions.filter((option) => !props.state.exchanges.includes(option));
  return [...props.state.exchanges, ...options];
});

const loggingOptions = [
  { value: '0', label: 'warning' },
  { value: '1', label: 'info' },
  { value: '2', label: 'debug' },
  { value: '3', label: 'trace' },
];

const hslOptions = computed(() => {
  const options = props.hslModes.map((mode) => String(mode).trim()).filter(Boolean);
  const selected = props.state.hslSignalMode.trim();
  if (selected && !options.includes(selected)) return [selected, ...options];
  return options.length ? options : selected ? [selected] : [];
});

function touch(): void {
  emit('change');
}

const suiteRef = useTemplateRef<InstanceType<typeof SuiteEditor>>('suiteRef');

/** Forwards SuiteEditor.foldDraft — called by useConfigEditor.collect() (:4769). */
function foldSuiteDraft(): void {
  suiteRef.value?.foldDraft();
}

defineExpose({ foldSuiteDraft });
</script>

<template>
  <div
    id="configs-editor"
    class="config-editor-grid flex min-h-max min-w-0 flex-none flex-col gap-3 overflow-visible pb-4.5 [container-type:inline-size] [container-name:backtest-editor] [scrollbar-color:rgb(var(--accent-rgb)/0.32)_rgb(var(--text-secondary-rgb)/0.04)]"
    data-test="configs-editor"
    @input="touch"
    @change="touch"
  >
    <div class="config-editor-intro relative flex min-h-[72px] items-start justify-between gap-5 border-b border-secondary/15 px-1 pb-3 pt-2 max-[900px]:flex-col max-[900px]:gap-2 max-[700px]:gap-3">
      <div>
        <div class="pt-[7px] text-xs font-bold uppercase tracking-[0.16em] text-accent-soft">{{ isV8 ? 'PBv8' : 'PBv7' }}</div>
        <h1 class="mt-1.5 text-[clamp(24px,2.4vw,34px)] leading-[1.15] tracking-[-0.035em] text-primary">{{ state.name ? t('v7backtest.editBacktest') : t('v7backtest.newBacktestConfig', { version: isV8 ? 'PBv8' : 'PBv7' }) }}</h1>
        <p class="mt-2 max-w-[760px] text-sm leading-[1.55] text-secondary">{{ t('v7backtest.editorIntro') }}</p>
      </div>
      <div class="mt-[7px] inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-accent/28 bg-accent-deep/10 px-[11px] py-[7px] text-xs text-accent-soft shadow-[0_0_0_3px_rgb(var(--accent-deep-rgb)/0.04)] max-[900px]:self-start max-[700px]:mt-0">
        <span class="h-[7px] w-[7px] rounded-full bg-accent shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.14),0_0_12px_rgb(var(--accent-rgb)/0.4)]"></span>{{ state.name || t('v7backtest.editorDraftStatus') }}
      </div>
    </div>

    <section
      class="config-editor-section relative min-w-0 overflow-visible rounded-xl border border-secondary/14 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-deep-rgb)/0.045),transparent_24rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] px-4 pb-4 pt-3.5"
      data-test="editor-section-basics"
    >
      <header class="mb-3 flex items-start justify-between gap-3 border-b border-secondary/14 pb-[9px] max-[700px]:flex-col">
        <div><h2 class="text-[16px] font-bold tracking-[-0.01em] text-primary">{{ t('v7backtest.editorBasics') }}</h2><p class="mt-[5px] max-w-[70ch] text-xs leading-[1.5] text-secondary">{{ t('v7backtest.editorBasicsHint') }}</p></div>
        <span class="min-w-[31px] rounded-md border border-accent/20 bg-accent-deep/8 px-[7px] py-1 text-center font-mono text-xs font-bold tracking-[0.08em] text-accent-soft opacity-75">01</span>
      </header>
      <!-- Row 1: Identity & Time (:2599-2613) -->
    <div class="form-row config-editor-12">
      <CoinMultiSelect id="ms-cfg-exchanges" v-model="state.exchanges" class="editor-span-6" :options="exchangesOptions" :placeholder="t('v7backtest.selectExchanges')" :tip="t('v7backtest.tip.exchanges')">
        <template #label>exchanges</template>
      </CoinMultiSelect>
      <div class="form-group editor-span-2">
        <label :data-tip="t('v7backtest.tip.configName')">config_name</label>
        <input v-model="state.name" type="text" data-test="cfg-name" />
      </div>
      <div class="form-group editor-span-2">
        <label :data-tip="t('v7backtest.tip.startDate')">start_date</label>
        <DatePicker v-model="state.startDate" :max="state.endDate || undefined" />
      </div>
      <div class="form-group editor-span-2">
        <label :data-tip="t('v7backtest.tip.endDate')">end_date</label>
        <DatePicker v-model="state.endDate" :min="state.startDate || undefined" />
        <label v-if="state.endDateIsNow" :data-tip="t('v7backtest.tip.endDateIsNow')" style="font-size: var(--fs-xs); color: var(--text-dim); margin-top: 2px; display: flex; gap: 4px; align-items: center">
          <input v-model="state.endDateIsNow" type="checkbox" style="width: auto" /> semantic 'now'
        </label>
      </div>
    </div>
    </section>

    <section
      class="config-editor-section relative min-w-0 overflow-visible rounded-xl border border-secondary/14 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-deep-rgb)/0.045),transparent_24rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] px-4 pb-4 pt-3.5"
      data-test="editor-section-trading"
    >
      <header class="mb-3 flex items-start justify-between gap-3 border-b border-secondary/14 pb-[9px] max-[700px]:flex-col">
        <div><h2 class="text-[16px] font-bold tracking-[-0.01em] text-primary">{{ t('v7backtest.editorTrading') }}</h2><p class="mt-[5px] max-w-[70ch] text-xs leading-[1.5] text-secondary">{{ t('v7backtest.editorTradingHint') }}</p></div>
        <span class="min-w-[31px] rounded-md border border-accent/20 bg-accent-deep/8 px-[7px] py-1 text-center font-mono text-xs font-bold tracking-[0.08em] text-accent-soft opacity-75">02</span>
      </header>
      <!-- Row 2: Balance, Collateral & Behavior (:2615-2634) -->
    <div class="form-row config-editor-12 config-editor-trading-primary">
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.startingBalance')">starting_balance</label><input v-model="state.startingBalance" type="number" min="500" /></div>
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.balanceSampleDivider')">balance_sample_divider</label><input v-model="state.balanceSampleDivider" type="number" min="1" /></div>
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.btcCollateralCap')">btc_collateral_cap</label><input v-model="state.btcCollateralCap" type="number" step="0.1" min="0" /></div>
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.btcCollateralLtvCap')">btc_collateral_ltv_cap</label><input v-model="state.btcCollateralLtvCap" type="number" step="0.1" min="0" /></div>
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.minimumCoinAgeDays')">minimum_coin_age_days</label><input v-model="state.minimumCoinAgeDays" type="number" min="1" /></div>
      <div class="form-group editor-span-2">
        <label :data-tip="t('v7backtest.tip.liquidationThreshold')">liquidation_threshold</label>
        <div class="num-stepper">
          <button type="button" class="stepper-btn" aria-label="Decrease liquidation_threshold" title="Decrease liquidation_threshold" @click="state.liquidationThreshold = String(Math.max(0, +(parseFloat(state.liquidationThreshold) - 0.01).toFixed(2)))"><PbIcon :icon="PhMinus" /></button>
          <input v-model="state.liquidationThreshold" type="number" step="0.01" min="0" max="0.99" />
          <button type="button" class="stepper-btn" aria-label="Increase liquidation_threshold" title="Increase liquidation_threshold" @click="state.liquidationThreshold = String(Math.min(0.99, +(parseFloat(state.liquidationThreshold) + 0.01).toFixed(2)))"><PbIcon :icon="PhPlus" /></button>
        </div>
      </div>
      <div class="form-group editor-span-12 config-editor-toggle-row">
        <div class="chk-row"><input id="cfg-dyn-wel" v-model="state.dynamicWelByTradability" type="checkbox" /><label for="cfg-dyn-wel" :data-tip="t('v7backtest.tip.dynamicWelByTradability')">dynamic_wel_by_tradability</label></div>
      </div>
    </div>

      <!-- Row 3: Fees & Controls (:2636-2679) -->
    <div class="expander" :class="{ open: advancedExecutionOpen }" data-test="advanced-execution-expander">
      <button
        type="button"
        class="expander-header"
        :data-tip="t('v7backtest.tip.advancedExecution')"
        :aria-expanded="advancedExecutionOpen"
        aria-controls="advanced-execution-settings"
        data-test="advanced-execution-expander-toggle"
        @click="advancedExecutionOpen = !advancedExecutionOpen"
      >
        <PbIcon class="arrow" :icon="PhCaretRight" /> {{ t('v7backtest.advancedExecutionSettings') }}
      </button>
      <div id="advanced-execution-settings" class="expander-body">
        <div v-if="advancedExecutionOpen" class="form-row config-editor-12 config-editor-trading-advanced">
          <div class="form-group editor-span-2">
            <div class="chk-row"><input id="cfg-maker-fee-enabled" v-model="state.makerFeeEnabled" type="checkbox" /><label for="cfg-maker-fee-enabled" :data-tip="t('v7backtest.tip.makerFeeOverride')">maker_fee_override</label></div>
            <div class="num-stepper">
              <button type="button" class="stepper-btn" aria-label="Decrease maker_fee_override" title="Decrease maker_fee_override" @click="state.makerFeeVal = String(Math.max(0, +(parseFloat(state.makerFeeVal) - 0.00001).toFixed(5)))"><PbIcon :icon="PhMinus" /></button>
              <input v-model="state.makerFeeVal" type="number" step="0.00001" min="0" max="0.01" :disabled="!state.makerFeeEnabled" />
              <button type="button" class="stepper-btn" aria-label="Increase maker_fee_override" title="Increase maker_fee_override" @click="state.makerFeeVal = String(Math.min(0.01, +(parseFloat(state.makerFeeVal) + 0.00001).toFixed(5)))"><PbIcon :icon="PhPlus" /></button>
            </div>
          </div>
          <div class="form-group editor-span-2">
            <div class="chk-row"><input id="cfg-taker-fee-enabled" v-model="state.takerFeeEnabled" type="checkbox" /><label for="cfg-taker-fee-enabled" :data-tip="t('v7backtest.tip.takerFeeOverride')">taker_fee_override</label></div>
            <div class="num-stepper">
              <button type="button" class="stepper-btn" aria-label="Decrease taker_fee_override" title="Decrease taker_fee_override" @click="state.takerFeeVal = String(Math.max(0, +(parseFloat(state.takerFeeVal) - 0.00001).toFixed(5)))"><PbIcon :icon="PhMinus" /></button>
              <input v-model="state.takerFeeVal" type="number" step="0.00001" min="0" max="0.01" :disabled="!state.takerFeeEnabled" />
              <button type="button" class="stepper-btn" aria-label="Increase taker_fee_override" title="Increase taker_fee_override" @click="state.takerFeeVal = String(Math.min(0.01, +(parseFloat(state.takerFeeVal) + 0.00001).toFixed(5)))"><PbIcon :icon="PhPlus" /></button>
            </div>
          </div>
          <div class="form-group editor-span-2">
            <label :data-tip="t('v7backtest.tip.marketOrderSlippagePct')">market_order_slippage_pct</label>
            <div class="num-stepper">
              <button type="button" class="stepper-btn" aria-label="Decrease market_order_slippage_pct" title="Decrease market_order_slippage_pct" @click="state.marketOrderSlippagePct = String(Math.max(0, +(parseFloat(state.marketOrderSlippagePct) - 0.0001).toFixed(4)))"><PbIcon :icon="PhMinus" /></button>
              <input v-model="state.marketOrderSlippagePct" type="number" step="0.0001" min="0" />
              <button type="button" class="stepper-btn" aria-label="Increase market_order_slippage_pct" title="Increase market_order_slippage_pct" @click="state.marketOrderSlippagePct = String(+(parseFloat(state.marketOrderSlippagePct) + 0.0001).toFixed(4))"><PbIcon :icon="PhPlus" /></button>
            </div>
          </div>
          <div class="form-group editor-span-2 config-editor-toggle-field">
            <div class="chk-row"><input id="cfg-filter-cost" v-model="state.filterByMinEffectiveCost" type="checkbox" /><label for="cfg-filter-cost" :data-tip="t('v7backtest.tip.filterByMinEffectiveCost')">filter_by_min_effective_cost</label></div>
          </div>
          <div class="form-group editor-span-2">
            <label :data-tip="t('v7backtest.tip.hslSignalMode')">hsl_signal_mode</label>
            <select v-model="state.hslSignalMode"><option v-for="mode in hslOptions" :key="mode" :value="mode">{{ mode }}</option></select>
          </div>
          <div class="form-group editor-span-2">
            <label :data-tip="t('v7backtest.tip.loggingLevel')">logging_level</label>
            <select v-model="state.loggingLevel"><option v-for="option in loggingOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select>
          </div>
        </div>
      </div>
    </div>
    </section>

    <section
      class="config-editor-section relative min-w-0 overflow-visible rounded-xl border border-secondary/14 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-deep-rgb)/0.045),transparent_24rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] px-4 pb-4 pt-3.5"
      data-test="editor-section-market-data"
    >
      <header class="mb-3 flex items-start justify-between gap-3 border-b border-secondary/14 pb-[9px] max-[700px]:flex-col">
        <div><h2 class="text-[16px] font-bold tracking-[-0.01em] text-primary">{{ t('v7backtest.editorMarketData') }}</h2><p class="mt-[5px] max-w-[70ch] text-xs leading-[1.5] text-secondary">{{ t('v7backtest.editorMarketDataHint') }}</p></div>
        <span class="min-w-[31px] rounded-md border border-accent/20 bg-accent-deep/8 px-[7px] py-1 text-center font-mono text-xs font-bold tracking-[0.08em] text-accent-soft opacity-75">03</span>
      </header>
      <!-- Row 4: Data Source (:2681-2698) -->
    <div class="form-row config-editor-12">
      <div class="form-group editor-span-6">
        <label :data-tip="t('v7backtest.tip.ohlcvSourceDir')">ohlcv_source_dir</label>
        <div style="display: flex; gap: var(--sp-xs)">
          <input v-model="state.ohlcvSourceDir" type="text" :placeholder="t('v7backtest.leaveEmptyForDefault')" />
          <button type="button" class="act-btn" style="white-space: nowrap" title="Use PBGui market data directory" @click="fillPbguiDataPath">
            <PbIcon :icon="PhFolderOpen" />
            PBGui Data
          </button>
        </div>
      </div>
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.candleIntervalMinutes')">candle_interval_minutes</label><input v-model="state.candleIntervalMinutes" type="number" min="1" /></div>
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.gapToleranceOhlcvsMinutes')">gap_tolerance_ohlcvs_minutes</label><input v-model="state.gapToleranceOhlcvsMinutes" type="number" min="1" /></div>
      <div class="form-group editor-span-1 config-editor-toggle-field justify-end"><div class="chk-row"><input id="cfg-compress" v-model="state.compressCache" type="checkbox" /><label for="cfg-compress" :data-tip="t('v7backtest.tip.compressCache')">compress_cache</label></div></div>
      <div class="form-group editor-span-1 config-editor-toggle-field justify-end"><div class="chk-row"><input id="cfg-vol-norm" v-model="state.volumeNormalization" type="checkbox" /><label for="cfg-vol-norm" :data-tip="t('v7backtest.tip.volumeNormalization')">volume_normalization</label></div></div>
    </div>

    <!-- coin_sources + market_settings_sources (:2700-2750) -->
    <div class="expander" :class="{ open: coinSourcesOpen }">
      <button type="button" class="expander-header" :aria-expanded="coinSourcesOpen" :data-tip="t('v7backtest.tip.coinSources')" @click="coinSourcesOpen = !coinSourcesOpen"><PbIcon class="arrow" :icon="PhCaretRight" /> coin_sources ({{ Object.keys(state.coinSources).length }} configured)</button>
      <div class="expander-body"><KvCoinSources v-model="state.coinSources" :exchange-options="exchangeOptions" :preserve-case="isV8" :load-symbols="loadSymbols" /></div>
    </div>
    <div class="expander" :class="{ open: marketSourcesOpen }">
      <button type="button" class="expander-header" :aria-expanded="marketSourcesOpen" :data-tip="t('v7backtest.tip.marketSettingsSources')" @click="marketSourcesOpen = !marketSourcesOpen"><PbIcon class="arrow" :icon="PhCaretRight" /> market_settings_sources ({{ Object.keys(state.marketSettingsSources).length }} configured)</button>
      <div class="expander-body"><KvCoinSources v-model="state.marketSettingsSources" :exchange-options="exchangeOptions" :preserve-case="isV8" :load-symbols="loadSymbols" /></div>
    </div>

    <AdvancedFieldsPanel v-if="isV8" :market-settings="marketSettings" :result-metrics="resultMetrics" :exchanges="exchangeOptions" :coins="marketCoins" />
    </section>

    <section
      class="config-editor-section relative min-w-0 overflow-visible rounded-xl border border-secondary/14 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-deep-rgb)/0.045),transparent_24rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] px-4 pb-4 pt-3.5"
      data-test="editor-section-filters"
    >
      <header class="mb-3 flex items-start justify-between gap-3 border-b border-secondary/14 pb-[9px] max-[700px]:flex-col">
        <div><h2 class="text-[16px] font-bold tracking-[-0.01em] text-primary">{{ t('v7backtest.coinsAndFilters') }}</h2><p class="mt-[5px] max-w-[70ch] text-xs leading-[1.5] text-secondary">{{ t('v7backtest.editorFiltersHint') }}</p></div>
        <div class="flex shrink-0 items-center gap-2 max-[700px]:w-full max-[700px]:justify-between" data-test="editor-filter-toolbar">
          <span class="min-w-[31px] rounded-md border border-accent/20 bg-accent-deep/8 px-[7px] py-1 text-center font-mono text-xs font-bold tracking-[0.08em] text-accent-soft opacity-75">04</span>
          <button type="button" class="act-btn" :title="t('v7backtest.applyFiltersTitle')" @click="applyFilters">{{ t('v7backtest.applyFilters') }}</button>
        </div>
      </header>
      <!-- Coins & Filters (:2753-2804) -->
    <div class="form-row config-editor-12 config-editor-filters">
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.marketCap')">market_cap (min M$)</label><input v-model="state.marketCap" type="number" step="50" /></div>
      <div class="form-group editor-span-2"><label :data-tip="t('v7backtest.tip.volMcap')">vol/mcap</label><input v-model="state.volMcap" type="number" step="0.05" /></div>
      <CoinMultiSelect id="ms-cfg-tags" v-model="state.tags" class="editor-span-4" :options="tagOptions" :placeholder="t('v7backtest.selectTags')" :tip="t('v7backtest.tip.tags')" select-all-button>
        <template #label>tags</template>
      </CoinMultiSelect>
      <div class="form-group editor-span-2 config-editor-toggle-field"><div class="chk-row"><input id="cfg-only-cpt" v-model="state.onlyCpt" type="checkbox" /><label for="cfg-only-cpt" :data-tip="t('v7backtest.tip.onlyCpt')">only_cpt</label></div></div>
      <div class="form-group editor-span-2 config-editor-toggle-field"><div class="chk-row"><input id="cfg-notices-ignore" v-model="state.noticesIgnore" type="checkbox" /><label for="cfg-notices-ignore" :data-tip="t('v7backtest.tip.noticesIgnore')">notices_ignore</label></div></div>
    </div>
    <div class="form-row cols-2">
      <CoinMultiSelect id="ms-cfg-app-long" v-model="state.approvedLong" :options="coinOptions" :labels="coinLabels" :tip="t('v7backtest.tip.approvedCoinsLong')" allow-all>
        <template #label>approved_coins_long</template>
      </CoinMultiSelect>
      <CoinMultiSelect id="ms-cfg-app-short" v-model="state.approvedShort" :options="coinOptions" :labels="coinLabels" :tip="t('v7backtest.tip.approvedCoinsShort')" allow-all>
        <template #label>approved_coins_short</template>
      </CoinMultiSelect>
    </div>
    <div class="form-row cols-2">
      <CoinMultiSelect id="ms-cfg-ign-long" v-model="state.ignoredLong" :options="coinOptionsWithoutAll" :labels="coinLabels" :tip="t('v7backtest.tip.ignoredCoinsLong')">
        <template #label>ignored_coins_long</template>
      </CoinMultiSelect>
      <CoinMultiSelect id="ms-cfg-ign-short" v-model="state.ignoredShort" :options="coinOptionsWithoutAll" :labels="coinLabels" :tip="t('v7backtest.tip.ignoredCoinsShort')">
        <template #label>ignored_coins_short</template>
      </CoinMultiSelect>
    </div>
    </section>

    <section
      class="config-editor-section config-editor-section-bot relative min-w-0 overflow-visible rounded-xl border border-secondary/14 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-deep-rgb)/0.045),transparent_24rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] px-4 pb-4 pt-3.5"
      data-test="editor-section-bot"
    >
      <header class="mb-3 flex items-start justify-between gap-3 border-b border-secondary/14 pb-[9px] max-[700px]:flex-col">
        <div><h2 class="text-[16px] font-bold tracking-[-0.01em] text-primary">{{ t('v7backtest.editorBot') }}</h2><p class="mt-[5px] max-w-[70ch] text-xs leading-[1.5] text-secondary">{{ t('v7backtest.editorBotHint') }}</p></div>
        <span class="min-w-[31px] rounded-md border border-accent/20 bg-accent-deep/8 px-[7px] py-1 text-center font-mono text-xs font-bold tracking-[0.08em] text-accent-soft opacity-75">05</span>
      </header>

    <!-- Bot Configuration (:2812-2871) -->
    <div class="section-title">{{ t('v7backtest.botConfiguration') }}</div>
    <div class="form-row cols-2">
      <BotSideEditor v-model="state.botLongJson" v-model:twe="state.longTwe" v-model:npos="state.longNpos" side="long" :version="isV8 ? 'v8' : 'v7'" :param-status="paramStatus.long" :error-line="longErrorLine" />
      <BotSideEditor v-model="state.botShortJson" v-model:twe="state.shortTwe" v-model:npos="state.shortNpos" side="short" :version="isV8 ? 'v8' : 'v7'" :param-status="paramStatus.short" :error-line="shortErrorLine" />
    </div>


      <!-- Coin Overrides embed (:2807, :2927) -->
    <CoinOverridesPanel :store="coinOv" />

    <!-- Suite Mode embed (:2810, :2915) -->
    <SuiteEditor
      ref="suiteRef"
      :model-value="suite"
      :exchanges="suiteExchanges"
      :available-coins="availableCoins"
      :bot-params="botParams"
      :is-v8="isV8"
      :exchange-options="exchangeOptions"
      :load-symbols="loadSymbols"
      @update:model-value="emit('update:suite', $event)"
      @template-exchanges="emit('template-exchanges', $event)"
    />

    <!-- Additional (unknown) backtest parameters (:2873-2876) -->
    <div v-if="state.extraBt.length > 0" class="expander" :class="{ open: additionalOpen }" data-test="additional-params-expander">
      <button type="button" class="expander-header" :aria-expanded="additionalOpen" data-test="additional-params-expander-toggle" :data-tip="t('v7backtest.tip.additionalParameters')" @click="additionalOpen = !additionalOpen"><PbIcon class="arrow" :icon="PhCaretRight" /> {{ t('v7backtest.additionalParameters') }}</button>
      <div class="expander-body">
        <div class="form-group">
          <label :data-tip="t('v7backtest.tip.baseDir')">base_dir</label>
          <input type="text" :value="'backtests/pbgui/' + (state.name || '{config-name}')" readonly />
        </div>
        <div class="form-row cols-3">
          <div v-for="field in state.extraBt" :key="field.key" class="form-group" :style="field.kind === 'json' ? 'grid-column: span 3' : ''">
            <label :data-tip="t(EXTRA_BT_META[field.key]?.tip ?? '')">{{ field.key }}</label>
            <div v-if="field.kind === 'boolean'" class="chk-row"><input v-model="field.checked" type="checkbox" :aria-label="field.key" /></div>
            <input v-else-if="field.kind === 'number'" v-model="field.text" type="number" class="form-input" />
            <textarea v-else-if="field.kind === 'json'" v-model="field.text" :data-test="'extra-bt-' + field.key" style="overflow: hidden; resize: vertical"></textarea>
            <input v-else v-model="field.text" type="text" class="form-input" :placeholder="field.kind === 'null' ? 'null' : ''" />
            <div v-if="EXTRA_BT_META[field.key]?.fmt" style="font-size: var(--fs-xs); color: var(--text-dim); margin-top: 2px">{{ EXTRA_BT_META[field.key]!.fmt }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Raw JSON expander (:2878-2892) -->
    <div class="expander" :class="{ open: rawJsonOpen }" data-test="raw-json-expander">
      <button type="button" class="expander-header" :aria-expanded="rawJsonOpen" data-test="raw-json-expander-toggle" :data-tip="t('v7backtest.tip.rawJson')" @click="rawJsonOpen = !rawJsonOpen"><PbIcon class="arrow" :icon="PhCaretRight" /> {{ t('v7backtest.rawJson') }}</button>
      <div class="expander-body">
        <div class="form-group">
          <div class="raw-json-wrap">
            <div class="field-status" :class="{ error: rawErrorLine }" aria-live="polite" data-test="cfg-raw-json-status"></div>
            <textarea v-model="state.rawJson" data-test="cfg-raw-json" style="overflow: hidden; resize: vertical"></textarea>
          </div>
        </div>
      </div>
    </div>
    </section>
  </div>
</template>
