<script setup lang="ts">
/**
 * Compare stage (:304-322) — mode radios (updateCompareModeUi :1205-1209),
 * PB7 folder / fills-range rows hidden per flavour, and the result tables
 * (renderCompareResult :1344-1355 with the label/column derivation from
 * lib/compareTables).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { deepGet } from '../lib/format';
import { compareCellText, compareColumns, compareSourceLabels, compareStatusesAndLabels } from '../lib/compareTables';
import type { CompareRow } from '../types';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { useCompare } from '../composables/useCompare';

type Compare = ReturnType<typeof useCompare>;
const props = defineProps<{ store: ExplorerStore; compare: Compare }>();
const { t } = useI18n();
const store = props.store;

const data = computed(() => props.compare.result.value);
const showPb7Only = computed(() => store.adapter.isV8 || store.controls.compareMode === 'pb7_b_c');
const statusModel = computed(() => compareStatusesAndLabels(store.adapter.isV8, data.value?.summary ?? null, data.value, store.state.compareBaselineAvailable));
const sourceLabels = computed(() => compareSourceLabels(store.adapter.isV8, data.value, store.state.compareBaselineAvailable));
const columns = computed(() => compareColumns(store.adapter.isV8, data.value, store.state.compareBaselineAvailable));
const eventRows = computed(() => Object.entries(deepGet<Record<string, { long?: number; short?: number; total?: number }>>(data.value, ['summary', 'events'], {}) || {}));

function sideRows(side: 'long' | 'short'): CompareRow[] {
  return deepGet<CompareRow[]>(data.value, ['rows', side], []);
}
</script>

<template>
  <section id="stage-compare" class="stage-view" :class="{ active: store.controls.stage === 'compare' }">
    <section class="panel-card pbgui-card">
      <h3>{{ t('v7explore.compare') }}</h3>
      <div class="grid">
        <div class="field full">
          <label>{{ t('v7explore.compareMode') }}</label>
          <div class="toolbar">
            <label class="check-row" id="compare-mode-primary">
              <input v-model="store.controls.compareMode" type="radio" name="compare-mode" value="pb7_b_c" @change="store.invalidateCompareRequest()">
              {{ store.compareModePrimaryText.value || (store.adapter.isV8 ? t('v7explore.compareModePrimaryV8') : t('v7explore.compareModePrimary')) }}
            </label>
            <label class="check-row" id="compare-mode-secondary" v-show="!store.adapter.isV8">
              <input v-model="store.controls.compareMode" type="radio" name="compare-mode" value="b_c" @change="store.invalidateCompareRequest()">
              <span>{{ t('v7explore.compareModeSecondary') }}</span>
            </label>
          </div>
        </div>
        <div class="field third"><label for="compare-max-candles">{{ t('v7explore.compareMaxCandles') }}</label><input id="compare-max-candles" v-model.number="store.controls.compareMaxCandles" type="number" min="10" max="20000" step="50" @change="store.invalidateCompareRequest()"></div>
        <div class="field full compare-pb7-only" v-show="showPb7Only">
          <label for="compare-pb7-folder">{{ store.adapter.isV8 ? t('v7explore.storedPb8Result') : t('v7explore.pb7BacktestFolder') }}</label>
          <input id="compare-pb7-folder" v-model="store.controls.comparePb7Folder" type="text" :readonly="store.adapter.isV8" :placeholder="store.adapter.isV8 ? t('v7explore.storedResultHandoff') : '/path/to/backtest/result'" @change="store.invalidateCompareRequest()">
        </div>
        <label class="check-row full compare-pb7-only" v-show="showPb7Only && !store.adapter.isV8">
          <input id="compare-use-fills-range" v-model="store.controls.compareUseFillsRange" type="checkbox" @change="store.invalidateCompareRequest()">
          <span>{{ t('v7explore.useFillsRange') }}</span>
        </label>
        <label class="check-row full">
          <input id="compare-mismatches-only" v-model="store.controls.compareMismatchesOnly" type="checkbox" @change="store.invalidateCompareRequest()">
          <span>{{ t('v7explore.mismatchesOnly') }}</span>
        </label>
      </div>
      <button class="action-btn pbgui-action primary" id="btn-run-compare" type="button" style="margin-top:14px;width:100%" :disabled="compare.running.value" @click="compare.runCompare()">
        {{ compare.running.value ? t('v7explore.compareRunning') : t('v7explore.startCompare') }}
      </button>
    </section>
    <section class="panel-card pbgui-card" style="margin-top:var(--sp-md)">
      <h3>{{ t('v7explore.compareResult') }}</h3>
      <div id="compare-summary" class="hint">
        <span v-if="compare.summaryText.value" class="muted">{{ compare.summaryText.value }}</span>
        <template v-else-if="data && data.ok">
          <table class="orders">
            <thead><tr><th>{{ t('v7explore.source') }}</th><th>{{ t('v7explore.long') }}</th><th>{{ t('v7explore.short') }}</th><th>{{ t('v7explore.total') }}</th></tr></thead>
            <tbody>
              <tr v-for="[key, item] in eventRows" :key="key"><td>{{ sourceLabels[key] || key }}</td><td>{{ item?.long || 0 }}</td><td>{{ item?.short || 0 }}</td><td>{{ item?.total || 0 }}</td></tr>
            </tbody>
          </table>
          <div style="margin-top:12px">
            <table class="orders">
              <thead><tr><th>Side</th><th v-for="status in statusModel.statuses" :key="status">{{ statusModel.labels[status] || status }}</th></tr></thead>
              <tbody>
                <tr v-for="side in ['long', 'short']" :key="side">
                  <td>{{ side.toUpperCase() }}</td>
                  <td v-for="status in statusModel.statuses" :key="status">{{ deepGet<number>(data, ['summary', side, status], 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <span v-else-if="data && !data.ok" class="muted">{{ data.message || t('v7explore.compareFailed') }}</span>
        <template v-else>{{ t('v7explore.configureCompareHint') }}</template>
      </div>
      <div id="compare-progress" class="movie-progress" :class="{ active: compare.progress.value.pct >= 0 }">
        <div class="movie-progress-bar"><div id="compare-progress-fill" class="movie-progress-fill" :style="{ width: compare.progress.value.pct + '%' }"></div></div>
        <div id="compare-progress-text" class="movie-progress-text">{{ compare.progress.value.message || t('v7explore.waiting') }}</div>
      </div>
      <div id="compare-result" style="margin-top:12px" v-if="data && data.ok">
        <h4>{{ t('v7explore.longCompareRows') }}</h4>
        <div style="overflow:auto">
          <table class="orders compare-grid">
            <thead><tr><th v-for="[key, label] in columns" :key="key">{{ label }}</th></tr></thead>
            <tbody>
              <tr v-if="!sideRows('long').length"><td class="muted" style="text-align:left">{{ t('v7explore.noRows') }}</td></tr>
              <tr v-for="(row, idx) in sideRows('long')" :key="'l' + idx"><td v-for="[key] in columns" :key="key">{{ compareCellText(row, key, idx, statusModel.labels) }}</td></tr>
            </tbody>
          </table>
        </div>
        <h4>{{ t('v7explore.shortCompareRows') }}</h4>
        <div style="overflow:auto">
          <table class="orders compare-grid">
            <thead><tr><th v-for="[key, label] in columns" :key="key">{{ label }}</th></tr></thead>
            <tbody>
              <tr v-if="!sideRows('short').length"><td class="muted" style="text-align:left">{{ t('v7explore.noRows') }}</td></tr>
              <tr v-for="(row, idx) in sideRows('short')" :key="'s' + idx"><td v-for="[key] in columns" :key="key">{{ compareCellText(row, key, idx, statusModel.labels) }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </section>
</template>
