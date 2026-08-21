<script setup lang="ts">
/**
 * Shared analysis controls — the #shared-analysis-controls grid (:216-228).
 * Every input recalculates on change like the legacy listeners (:3160-3168);
 * the OHLCV source swap repopulates markets (:1169-1178).
 */
import { useI18n } from 'vue-i18n';
import type { ExplorerStore } from '../composables/useStrategyExplorer';

const props = defineProps<{ store: ExplorerStore }>();
const { t } = useI18n();
const store = props.store;

const OHLCV_SOURCES_V7 = ['PB7 cache/historical', 'Backtest ohlcv_source_dir', 'PBGui market_data'];

/** The floating date-picker global (:874-992) — opened from the 📅 triggers. */
function openDatePicker(id: string, el: HTMLElement): void {
  (window as unknown as { __dp?: { show(id: string, anchor: HTMLElement | null): void } }).__dp?.show(id, el);
}

function onChangeSource(): void {
  store.controls.exchange = '';
  store.controls.coin = '';
  void store.populateMarkets().then(() => {
    store.inferInitialSelectors(store.state.snapshot || ({} as never));
    store.invalidateConfigRequests();
    void store.recalculate();
  });
}
function onContextDaysInput(event: Event): void {
  const el = event.target as HTMLInputElement;
  store.controls.contextDays = Number(el.value || 0);
}
</script>

<template>
  <section id="shared-analysis-controls" class="panel-card pbgui-card shared-controls">
    <div class="shared-controls-grid">
      <div class="field">
        <label for="ohlcv-source-select" :data-tip="t('v7explore.ohlcvSourceTip')" data-i18n-tip="v7explore.ohlcvSourceTip">{{ t('v7explore.ohlcvSource') }}</label>
        <select id="ohlcv-source-select" v-model="store.controls.ohlcvSource" @change="onChangeSource">
          <option v-if="store.adapter.isV8" value="PB8 native candles">{{ t('v7explore.pb8NativeCandles') }}</option>
          <option v-for="source in OHLCV_SOURCES_V7" v-else :key="source" :value="source">{{ source }}</option>
        </select>
      </div>
      <div class="field">
        <label for="exchange-select" :data-tip="t('v7explore.exchangeTip')">{{ t('v7explore.exchange') }}</label>
        <select id="exchange-select" v-model="store.controls.exchange" @change="store.updateCoinSelect(); store.invalidateConfigRequests(); store.recalculate()">
          <option v-for="ex in store.exchangeOptions.value" :key="ex" :value="ex">{{ ex }}</option>
        </select>
      </div>
      <div class="field">
        <label for="coin-select" :data-tip="t('v7explore.coinTip')">{{ t('v7explore.coin') }}</label>
        <select id="coin-select" v-model="store.controls.coin" :disabled="!store.coinOptions.value.length" @change="store.invalidateConfigRequests(); store.recalculate()">
          <option v-for="coin in store.coinOptions.value" :key="coin" :value="coin">{{ coin }}</option>
        </select>
      </div>
      <div class="field">
        <label for="start-date-input" :data-tip="t('v7explore.startDateTip')">{{ t('v7explore.startDate') }}</label>
        <div class="date-input-wrap">
          <input id="start-date-input" v-model="store.controls.startDate" type="text" placeholder="YYYY-MM-DD" :data-tip="t('v7explore.startDateTip')">
          <button type="button" class="calendar-trigger" data-dp="start-date-input" :title="t('v7explore.openCalendar')" @click="openDatePicker('start-date-input', $event.currentTarget as HTMLElement)">&#x1F4C5;</button>
        </div>
      </div>
      <div class="field">
        <label for="start-time-input" :data-tip="t('v7explore.startTimeTip')">{{ t('v7explore.startTime') }}</label>
        <input id="start-time-input" v-model="store.controls.startTime" type="time" @change="store.recalculate()">
      </div>
      <div class="field">
        <label for="reference-price-input" :data-tip="t('v7explore.referencePriceTip')">{{ t('v7explore.referencePrice') }}</label>
        <input id="reference-price-input" v-model.number="store.controls.referencePrice" type="number" step="0.000001" @change="store.recalculate()">
      </div>
      <div class="field">
        <label for="balance-input" :data-tip="t('v7explore.balanceTip')">{{ t('v7explore.balance') }}</label>
        <input id="balance-input" v-model.number="store.controls.balance" type="number" step="1" @change="store.recalculate()">
      </div>
      <div class="field">
        <label for="context-days-input" :data-tip="t('v7explore.chartContextTip')">{{ t('v7explore.chartContext') }}</label>
        <input id="context-days-input" :value="store.controls.contextDays" type="range" min="0.5" max="60" step="0.5" :data-tip="t('v7explore.chartContextTip')" @input="onContextDaysInput" @change="store.recalculate()">
        <span class="slider-value" id="context-days-value">{{ Number(store.controls.contextDays || 0).toFixed(2) }}</span>
      </div>
      <div class="check-row" style="display:none"><input id="load-candles-toggle" type="checkbox" checked><label for="load-candles-toggle">{{ t('v7explore.loadCandles') }}</label></div>
    </div>
  </section>
</template>
