<script setup lang="ts">
/**
 * Shared analysis controls — the #shared-analysis-controls grid (:216-228).
 * Every input recalculates on change like the legacy listeners (:3160-3168);
 * the OHLCV source swap repopulates markets (:1169-1178).
 */
import { useI18n } from 'vue-i18n';
import { PhCalendar } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
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
</script>

<template>
  <section
    id="shared-analysis-controls"
    class="pbgui-card border border-accent/16 rounded-[11px] bg-panel bg-[linear-gradient(90deg,rgb(var(--bg-panel-rgb)/0.76),rgb(var(--bg-page-rgb)/0.72))] py-3.25 px-3.5 shadow-[var(--shadow-panel)]"
  >
    <div class="grid items-end gap-2.25 grid-cols-[minmax(170px,1.2fr)_minmax(120px,0.8fr)_minmax(120px,0.8fr)_minmax(130px,0.8fr)_minmax(105px,0.6fr)_minmax(120px,0.7fr)_minmax(100px,0.6fr)_minmax(150px,0.9fr)] max-[1250px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[1180px]:grid-cols-[repeat(4,minmax(0,1fr))] max-[640px]:grid-cols-[repeat(2,minmax(0,1fr))]">
      <div class="flex flex-col gap-0.75">
        <Label id="ohlcv-source-label" for="ohlcv-source-select" :data-tip="t('v7explore.ohlcvSourceTip')" data-i18n-tip="v7explore.ohlcvSourceTip">{{ t('v7explore.ohlcvSource') }}</Label>
        <SelectRoot v-model="store.controls.ohlcvSource" @update:model-value="onChangeSource">
          <SelectTrigger id="ohlcv-source-select" aria-labelledby="ohlcv-source-label">
            <span>{{ store.adapter.isV8 && store.controls.ohlcvSource === 'PB8 native candles' ? t('v7explore.pb8NativeCandles') : store.controls.ohlcvSource }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-if="store.adapter.isV8" value="PB8 native candles">{{ t('v7explore.pb8NativeCandles') }}</SelectItem>
            <SelectItem v-for="source in OHLCV_SOURCES_V7" v-else :key="source" :value="source">{{ source }}</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>
      <div class="flex flex-col gap-0.75">
        <Label id="exchange-select-label" for="exchange-select" :data-tip="t('v7explore.exchangeTip')">{{ t('v7explore.exchange') }}</Label>
        <SelectRoot v-model="store.controls.exchange" @update:model-value="store.updateCoinSelect(); store.invalidateConfigRequests(); store.recalculate()">
          <SelectTrigger id="exchange-select" aria-labelledby="exchange-select-label">
            <span>{{ store.controls.exchange }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="ex in store.exchangeOptions.value" :key="ex" :value="ex">{{ ex }}</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>
      <div class="flex flex-col gap-0.75">
        <Label id="coin-select-label" for="coin-select" :data-tip="t('v7explore.coinTip')">{{ t('v7explore.coin') }}</Label>
        <SelectRoot v-model="store.controls.coin" @update:model-value="store.invalidateConfigRequests(); store.recalculate()">
          <SelectTrigger id="coin-select" aria-labelledby="coin-select-label" :disabled="!store.coinOptions.value.length">
            <span>{{ store.controls.coin }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="coin in store.coinOptions.value" :key="coin" :value="coin">{{ coin }}</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>
      <div class="flex flex-col gap-0.75">
        <Label for="start-date-input" :data-tip="t('v7explore.startDateTip')">{{ t('v7explore.startDate') }}</Label>
        <div class="relative">
          <Input id="start-date-input" class="pr-7" v-model="store.controls.startDate" type="text" placeholder="YYYY-MM-DD" :data-tip="t('v7explore.startDateTip')" />
          <!-- ui-migration: blocked — legacy window.__dp datepicker bridge (lib/datePicker.ts); the trigger stays raw -->
          <button type="button" class="absolute right-0.5 top-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent px-0.75 py-0 text-sm leading-none text-primary" data-dp="start-date-input" :title="t('v7explore.openCalendar')" :aria-label="t('v7explore.openCalendar')" @click="openDatePicker('start-date-input', $event.currentTarget as HTMLElement)"><PbIcon :icon="PhCalendar" :size="14" /></button>
        </div>
      </div>
      <div class="flex flex-col gap-0.75">
        <Label for="start-time-input" :data-tip="t('v7explore.startTimeTip')">{{ t('v7explore.startTime') }}</Label>
        <Input id="start-time-input" v-model="store.controls.startTime" type="time" @change="store.recalculate()" />
      </div>
      <div class="flex flex-col gap-0.75">
        <Label for="reference-price-input" :data-tip="t('v7explore.referencePriceTip')">{{ t('v7explore.referencePrice') }}</Label>
        <Input id="reference-price-input" v-model.number="store.controls.referencePrice" type="number" step="0.000001" @change="store.recalculate()" />
      </div>
      <div class="flex flex-col gap-0.75">
        <Label for="balance-input" :data-tip="t('v7explore.balanceTip')">{{ t('v7explore.balance') }}</Label>
        <Input id="balance-input" v-model.number="store.controls.balance" type="number" step="1" @change="store.recalculate()" />
      </div>
      <div class="flex flex-col gap-0.75">
        <Label for="context-days-input" :data-tip="t('v7explore.chartContextTip')">{{ t('v7explore.chartContext') }}</Label>
        <Slider id="context-days-input" v-model="store.controls.contextDays" :min="0.5" :max="60" :step="0.5" :label="t('v7explore.chartContext')" :data-tip="t('v7explore.chartContextTip')" @value-commit="store.recalculate()" />
        <span class="min-w-16 px-1.5 py-0.5 rounded-[5px] border border-accent/18 bg-accent-deep/8 text-right font-mono text-[10px] font-bold text-accent-soft" id="context-days-value">{{ Number(store.controls.contextDays || 0).toFixed(2) }}</span>
      </div>
    </div>
  </section>
</template>
