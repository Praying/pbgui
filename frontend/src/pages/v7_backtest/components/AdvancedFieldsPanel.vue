<script setup lang="ts">
import { PhCaretRight } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import {
  MARKET_FIELDS,
  METRIC_CATEGORY_ORDER,
  metricCategory,
  validateMarketSettings,
  type MarketSettingsState,
  type ResultMetricsState,
} from '../lib/advancedFields';

/**
 * AdvancedFieldsPanel — the v8-only expanders of the backtest editor:
 * market-settings overrides (buildMarketSettingsHtml :2307-2324,
 * row add/set/remove :2339-2370) and result metrics (buildResultMetrics
 * Html :2427-2448, the mode radios + category picker :2471-2511). Both
 * reactive states are owned by useConfigEditor; this component edits them
 * in place (the shared-reactive-object pattern of the editor form).
 */

const props = withDefaults(
  defineProps<{
    /** Reactive states owned by useConfigEditor — mutated in place. */
    marketSettings: MarketSettingsState;
    resultMetrics: ResultMetricsState;
    exchanges?: readonly string[];
    coins?: readonly string[];
  }>(),
  { exchanges: () => [], coins: () => [] }
);

const { t } = useI18n();
const emit = defineEmits<{ 'retry-metrics': [] }>();

const marketError = computed(() => validateMarketSettings(props.marketSettings));

/** i18n keys for the MARKET_FIELDS column tooltips. */
const MARKET_FIELD_TIPS: Record<string, string> = {
  qty_step: 'v7backtest.tip.qtyStep',
  price_step: 'v7backtest.tip.priceStep',
  min_qty: 'v7backtest.tip.minQty',
  min_cost: 'v7backtest.tip.minCost',
  c_mult: 'v7backtest.tip.cMult',
};

function setRow(index: number, patch: Partial<{ scope: 'global' | 'exchange'; exchange: string; coin: string }>): void {
  const rows = props.marketSettings.rows.slice();
  const row = { ...rows[index]!, ...patch };
  rows[index] = row;
  props.marketSettings.rows = rows;
  props.marketSettings.error = '';
}

function setCell(index: number, field: string, raw: string): void {
  const rows = props.marketSettings.rows.slice();
  const values = { ...rows[index]!.values };
  if (String(raw).trim() === '') delete values[field];
  else values[field] = raw;
  rows[index] = { ...rows[index]!, values };
  props.marketSettings.rows = rows;
  props.marketSettings.error = '';
}

function addRow(): void {
  props.marketSettings.rows = [...props.marketSettings.rows, { scope: 'global', exchange: 'binance', coin: '', values: {} }];
  props.marketSettings.error = '';
}

function removeRow(index: number): void {
  props.marketSettings.rows = props.marketSettings.rows.filter((_, i) => i !== index);
  props.marketSettings.error = '';
}

function rowExchangeOptions(exchange: string): string[] {
  const options = props.exchanges.map((entry) => entry.toLowerCase());
  const value = String(exchange || '').toLowerCase();
  if (value && !options.includes(value)) options.push(value);
  return options;
}

const metricFilter = ref('');

function setMode(mode: ResultMetricsState['mode']): void {
  props.resultMetrics.mode = mode;
  props.resultMetrics.error = '';
}

function toggleMetric(metric: string): void {
  const selected = props.resultMetrics.selected.slice();
  const index = selected.indexOf(metric);
  if (index >= 0) selected.splice(index, 1);
  else selected.push(metric);
  props.resultMetrics.selected = selected;
  props.resultMetrics.error = '';
}

const groupedMetrics = computed(() => {
  const needle = metricFilter.value.trim().toLowerCase();
  const categories: Record<string, string[]> = {};
  for (const metric of props.resultMetrics.available) {
    if (needle && !metric.toLowerCase().includes(needle)) continue;
    const category = metricCategory(metric, (key, fallback) => t(key, fallback));
    (categories[category] ??= []).push(metric);
  }
  return METRIC_CATEGORY_ORDER.filter((category) => categories[category]?.length).map((category) => ({ category, metrics: categories[category]! }));
});
</script>

<template>
  <div class="expander" id="exp-market-settings">
    <div class="expander-header" :data-tip="t('v7backtest.tip.marketSettingsOverrides')"><PbIcon class="arrow" :icon="PhCaretRight" /> {{ t('v7backtest.marketSettingsOverrides') }} ({{ marketSettings.rows.length }} {{ t('v7backtest.configured') }})</div>
    <div class="expander-body">
      <div class="advanced-help">
        Override historical exchange metadata after <code>market_settings_sources</code> is resolved. Blank values inherit from the selected source. Exchange-specific rows take
        precedence over all-exchange rows.
      </div>
      <div class="advanced-table-wrap">
        <table class="advanced-table">
          <thead>
            <tr>
              <th :data-tip="t('v7backtest.tip.msScope')">Scope</th>
              <th :data-tip="t('v7backtest.tip.msExchange')">Exchange</th>
              <th :data-tip="t('v7backtest.tip.msCoin')">Coin</th>
              <th v-for="field in MARKET_FIELDS" :key="field" :data-tip="t(MARKET_FIELD_TIPS[field] ?? '')">{{ field }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="marketSettings.rows.length === 0">
              <td :colspan="MARKET_FIELDS.length + 4" class="advanced-empty">No market-setting overrides configured.</td>
            </tr>
            <tr v-for="(row, index) in marketSettings.rows" :key="index">
              <td>
                <select :value="row.scope" @change="setRow(index, { scope: ($event.target as HTMLSelectElement).value as 'global' | 'exchange' })">
                  <option value="global">All exchanges</option>
                  <option value="exchange">Specific exchange</option>
                </select>
              </td>
              <td>
                <select :disabled="row.scope === 'global'" :value="row.exchange" @change="setRow(index, { exchange: ($event.target as HTMLSelectElement).value })">
                  <option v-for="exchange in rowExchangeOptions(row.exchange)" :key="exchange" :value="exchange">{{ exchange }}</option>
                </select>
              </td>
              <td><input :value="row.coin" list="market-settings-coin-list" placeholder="BTC" @input="setRow(index, { coin: ($event.target as HTMLInputElement).value })" /></td>
              <td v-for="field in MARKET_FIELDS" :key="field">
                <input
                  type="number"
                  step="any"
                  :min="field === 'min_cost' ? 0 : 0.000000000001"
                  :value="row.values[field] === undefined ? '' : String(row.values[field])"
                  placeholder="inherit"
                  @input="setCell(index, field, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td style="white-space: nowrap">
                <button type="button" class="act-btn danger" @click="removeRow(index)">{{ t('v7backtest.delete') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <datalist id="market-settings-coin-list">
        <option v-for="coin in coins" :key="coin" :value="coin" />
      </datalist>
      <div class="field-status field-status-inline" data-test="market-settings-status">{{ marketError }}</div>
      <button type="button" class="act-btn" style="margin-top: var(--sp-sm)" @click="addRow">{{ t('v7backtest.addOverride') }}</button>
    </div>
  </div>

  <div class="expander" id="exp-result-metrics">
    <div class="expander-header" :data-tip="t('v7backtest.tip.resultMetrics')"><PbIcon class="arrow" :icon="PhCaretRight" /> {{ t('v7backtest.resultMetrics') }}</div>
    <div class="expander-body">
      <div class="advanced-help">Controls terminal result visibility only. All metrics are still computed and saved. Optimize scoring and limit metrics are always included in Default and Custom modes.</div>
      <div class="metric-mode-row">
        <label class="metric-mode-button" :data-tip="t('v7backtest.tip.metricsDefaultMode')"><input type="radio" name="result-metrics-mode" value="default" :checked="resultMetrics.mode === 'default'" @change="setMode('default')" /> {{ t('v7backtest.default') }}</label>
        <label class="metric-mode-button" :data-tip="t('v7backtest.tip.metricsAllMode')"><input type="radio" name="result-metrics-mode" value="all" :checked="resultMetrics.mode === 'all'" @change="setMode('all')" /> {{ t('common.all') }}</label>
        <label class="metric-mode-button" :data-tip="t('v7backtest.tip.metricsCustomMode')"><input type="radio" name="result-metrics-mode" value="custom" :checked="resultMetrics.mode === 'custom'" @change="setMode('custom')" /> {{ t('v7backtest.customAdditions') }}</label>
      </div>
      <div v-if="resultMetrics.mode === 'custom'" data-test="result-metrics-custom">
        <div class="metric-picker-toolbar">
          <input v-model="metricFilter" class="metric-picker-search" type="search" :placeholder="t('v7backtest.searchInstalledMetrics')" />
          <span class="metric-selected-summary">{{ resultMetrics.selected.length }} selected</span>
        </div>
        <div data-test="result-metrics-list">
          <div v-if="resultMetrics.error" class="advanced-empty">
            {{ resultMetrics.error }} <button type="button" class="act-btn" @click="emit('retry-metrics')">{{ t('v7backtest.retry') }}</button>
          </div>
          <div v-else-if="groupedMetrics.length === 0" class="advanced-empty">{{ t('v7backtest.noMatchingMetrics') }}</div>
          <div v-for="group in groupedMetrics" :key="group.category" class="metric-category">
            <div class="metric-category-title">{{ group.category }}</div>
            <div class="metric-picker-grid">
              <button
                v-for="metric in group.metrics"
                :key="metric"
                type="button"
                class="metric-picker-row metric-picker-button"
                :class="{ selected: resultMetrics.selected.includes(metric) }"
                :title="metric"
                @click="toggleMetric(metric)"
              >
                {{ metric }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="field-status field-status-inline" data-test="result-metrics-status"></div>
    </div>
  </div>
</template>
