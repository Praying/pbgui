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
  <section
    id="shared-analysis-controls"
    class="pbgui-card border border-accent/16 rounded-[11px] bg-panel bg-[linear-gradient(90deg,rgb(var(--bg-panel-rgb)/0.76),rgb(var(--bg-page-rgb)/0.72))] py-3.25 px-3.5 shadow-[0_12px_28px_rgba(5,8,14,0.14),0_1px_rgba(255,255,255,0.025)_inset]"
  >
    <div class="grid items-end gap-2.25 grid-cols-[minmax(170px,1.2fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(130px,0.8fr)_minmax(105px,0.6fr)_minmax(120px,0.7fr)_minmax(100px,0.6fr)_minmax(150px,0.9fr)] max-[1250px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[1180px]:grid-cols-[repeat(4,minmax(0,1fr))] max-[640px]:grid-cols-[repeat(2,minmax(0,1fr))]">
      <div class="flex flex-col gap-0.75">
        <label for="ohlcv-source-select" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.ohlcvSourceTip')" data-i18n-tip="v7explore.ohlcvSourceTip">{{ t('v7explore.ohlcvSource') }}</label>
        <select id="ohlcv-source-select" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" v-model="store.controls.ohlcvSource" @change="onChangeSource">
          <option v-if="store.adapter.isV8" value="PB8 native candles">{{ t('v7explore.pb8NativeCandles') }}</option>
          <option v-for="source in OHLCV_SOURCES_V7" v-else :key="source" :value="source">{{ source }}</option>
        </select>
      </div>
      <div class="flex flex-col gap-0.75">
        <label for="exchange-select" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.exchangeTip')">{{ t('v7explore.exchange') }}</label>
        <select id="exchange-select" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" v-model="store.controls.exchange" @change="store.updateCoinSelect(); store.invalidateConfigRequests(); store.recalculate()">
          <option v-for="ex in store.exchangeOptions.value" :key="ex" :value="ex">{{ ex }}</option>
        </select>
      </div>
      <div class="flex flex-col gap-0.75">
        <label for="coin-select" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.coinTip')">{{ t('v7explore.coin') }}</label>
        <select id="coin-select" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" v-model="store.controls.coin" :disabled="!store.coinOptions.value.length" @change="store.invalidateConfigRequests(); store.recalculate()">
          <option v-for="coin in store.coinOptions.value" :key="coin" :value="coin">{{ coin }}</option>
        </select>
      </div>
      <div class="flex flex-col gap-0.75">
        <label for="start-date-input" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.startDateTip')">{{ t('v7explore.startDate') }}</label>
        <div class="relative">
          <input id="start-date-input" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 pr-7 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" v-model="store.controls.startDate" type="text" placeholder="YYYY-MM-DD" :data-tip="t('v7explore.startDateTip')">
          <button type="button" class="absolute right-0.5 top-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent px-0.75 py-0 text-sm leading-none text-primary" data-dp="start-date-input" :title="t('v7explore.openCalendar')" @click="openDatePicker('start-date-input', $event.currentTarget as HTMLElement)">&#x1F4C5;</button>
        </div>
      </div>
      <div class="flex flex-col gap-0.75">
        <label for="start-time-input" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.startTimeTip')">{{ t('v7explore.startTime') }}</label>
        <input id="start-time-input" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" v-model="store.controls.startTime" type="time" @change="store.recalculate()">
      </div>
      <div class="flex flex-col gap-0.75">
        <label for="reference-price-input" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.referencePriceTip')">{{ t('v7explore.referencePrice') }}</label>
        <input id="reference-price-input" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" v-model.number="store.controls.referencePrice" type="number" step="0.000001" @change="store.recalculate()">
      </div>
      <div class="flex flex-col gap-0.75">
        <label for="balance-input" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.balanceTip')">{{ t('v7explore.balance') }}</label>
        <input id="balance-input" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" v-model.number="store.controls.balance" type="number" step="1" @change="store.recalculate()">
      </div>
      <div class="flex flex-col gap-0.75">
        <label for="context-days-input" class="text-secondary text-[10px] uppercase tracking-[0.075em]" :data-tip="t('v7explore.chartContextTip')">{{ t('v7explore.chartContext') }}</label>
        <input id="context-days-input" class="w-full min-h-[34px] rounded-[7px] border border-secondary/15 bg-page/70 px-2 py-1.25 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" :value="store.controls.contextDays" type="range" min="0.5" max="60" step="0.5" :data-tip="t('v7explore.chartContextTip')" @input="onContextDaysInput" @change="store.recalculate()">
        <span class="min-w-16 px-1.5 py-0.5 rounded-[5px] border border-accent/18 bg-accent-deep/8 text-right font-mono text-[10px] font-bold text-accent-soft" id="context-days-value">{{ Number(store.controls.contextDays || 0).toFixed(2) }}</span>
      </div>
      <div class="flex items-center gap-2 text-secondary text-sm" style="display:none"><input id="load-candles-toggle" class="w-auto" type="checkbox" checked><label for="load-candles-toggle">{{ t('v7explore.loadCandles') }}</label></div>
    </div>
  </section>
</template>
