<script setup lang="ts">
/*
 * The filters panel — legacy #filters-panel markup (:1481-1511) with the
 * number steppers rendered natively (initNumberSteppers :2527-2567 wrapped
 * the inputs at runtime; wheel stepping :2562-2565 included) and the tags
 * multiselect replaced by the Vue TagMultiselect. ids/classes are kept for
 * the ported CSS.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TagMultiselect from './TagMultiselect.vue';
import type { NumberFilterKey } from '../composables/useCoinDataState';

const props = defineProps<{
  exchanges: string[];
  exchange: string;
  marketCapText: string;
  volMcapText: string;
  tags: string[];
  tagOptions: string[];
  quoteFilter: string[];
  hip3Dex: string;
  hip3DexOptions: string[];
  hip3DexVisible: boolean;
}>();

const emit = defineEmits<{
  (e: 'set-exchange', value: string): void;
  (e: 'number-input', key: NumberFilterKey, value: string): boolean;
  (e: 'number-change', key: NumberFilterKey): void;
  (e: 'step-number', key: NumberFilterKey, direction: number): void;
  (e: 'set-tags', tags: string[]): void;
  (e: 'set-hip3-dex', value: string): void;
  (e: 'reset'): void;
}>();

const { t } = useI18n();

/** Sync draft display (syncFilterNumberInput :2418-2430) — the store owns the text. */
const quotesLabel = computed(() =>
  t('market.quotesPill', { quotes: props.quoteFilter.join(', ') || '-' }) // :2304
);
</script>

<template>
  <section class="panel flex-none overflow-visible rounded-[12px] border border-elevated bg-card" id="filters-panel">
    <div class="panel-body p-[1rem] overflow-visible">
      <div class="filters-grid grid grid-cols-[minmax(180px,1fr)_minmax(130px,0.7fr)_minmax(130px,0.7fr)_minmax(240px,1.45fr)_auto_auto] gap-2 items-end max-[1280px]:grid-cols-[repeat(3,minmax(0,1fr))] max-[980px]:grid-cols-1">
        <label class="field grid gap-[0.35rem] min-w-0">
          <span class="field-label text-sm text-secondary font-semibold">{{ t('market.exchange') }}</span>
          <select id="filter-exchange" class="w-full h-8 px-[0.75rem] rounded-lg border border-border-default bg-card text-primary text-base outline-none focus:border-secondary" :value="exchange" @change="emit('set-exchange', ($event.target as HTMLSelectElement).value)">
            <option v-for="option in exchanges" :key="option" :value="option" :selected="option === exchange">{{ option }}</option>
          </select>
        </label>
        <label class="field grid gap-[0.35rem] min-w-0">
          <span class="field-label text-sm text-secondary font-semibold">market_cap</span>
          <div class="num-stepper flex items-center">
            <button class="stepper-btn w-7 h-8 shrink-0 flex items-center justify-center border border-r-0 border-border-default rounded-l-lg bg-elevated text-primary text-[16px] leading-none cursor-pointer select-none p-0 hover:bg-accent-soft hover:text-page hover:border-accent-soft active:opacity-80" type="button" @mousedown.prevent @click="emit('step-number', 'market_cap', -1)">−</button>
            <input
              id="filter-market-cap"
              class="w-full flex-1 min-w-0 h-8 px-[0.75rem] rounded-none border border-border-default bg-card text-primary text-base text-center outline-none focus:border-secondary"
              type="number"
              min="0"
              step="250"
              :value="marketCapText"
              @wheel.prevent="emit('step-number', 'market_cap', ($event as WheelEvent).deltaY < 0 ? 1 : -1)"
              @input="emit('number-input', 'market_cap', ($event.target as HTMLInputElement).value)"
              @change="emit('number-change', 'market_cap')"
            >
            <button class="stepper-btn w-7 h-8 shrink-0 flex items-center justify-center border border-l-0 border-border-default rounded-r-lg bg-elevated text-primary text-[16px] leading-none cursor-pointer select-none p-0 hover:bg-accent-soft hover:text-page hover:border-accent-soft active:opacity-80" type="button" @mousedown.prevent @click="emit('step-number', 'market_cap', 1)">+</button>
          </div>
        </label>
        <label class="field grid gap-[0.35rem] min-w-0">
          <span class="field-label text-sm text-secondary font-semibold">vol/mcap</span>
          <div class="num-stepper flex items-center">
            <button class="stepper-btn w-7 h-8 shrink-0 flex items-center justify-center border border-r-0 border-border-default rounded-l-lg bg-elevated text-primary text-[16px] leading-none cursor-pointer select-none p-0 hover:bg-accent-soft hover:text-page hover:border-accent-soft active:opacity-80" type="button" @mousedown.prevent @click="emit('step-number', 'vol_mcap', -1)">−</button>
            <input
              id="filter-vol-mcap"
              class="stepper-input w-full flex-1 min-w-0 h-8 px-[0.75rem] rounded-none border border-border-default bg-card text-primary text-base text-center outline-none focus:border-secondary"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              :value="volMcapText"
              @wheel.prevent="emit('step-number', 'vol_mcap', ($event as WheelEvent).deltaY < 0 ? 1 : -1)"
              @input="emit('number-input', 'vol_mcap', ($event.target as HTMLInputElement).value)"
              @change="emit('number-change', 'vol_mcap')"
            >
            <button class="stepper-btn w-7 h-8 shrink-0 flex items-center justify-center border border-l-0 border-border-default rounded-r-lg bg-elevated text-primary text-[16px] leading-none cursor-pointer select-none p-0 hover:bg-accent-soft hover:text-page hover:border-accent-soft active:opacity-80" type="button" @mousedown.prevent @click="emit('step-number', 'vol_mcap', 1)">+</button>
          </div>
        </label>
        <div class="field grid gap-[0.35rem] min-w-0">
          <span class="field-label text-sm text-secondary font-semibold">{{ t('market.tags') }}</span>
          <TagMultiselect
            :options="tagOptions"
            :model-value="tags"
            :disabled="!tagOptions.length"
            @update:model-value="emit('set-tags', $event)"
          />
        </div>
        <div class="filters-status flex items-center justify-end gap-2 min-w-0 max-[980px]:justify-start">
          <span class="pill inline-flex items-center gap-[0.35rem] py-[0.28rem] px-[0.6rem] rounded-full border border-border-default bg-card text-primary text-sm whitespace-nowrap max-w-full overflow-hidden text-ellipsis" id="quotes-pill">{{ quotesLabel }}</span>
        </div>
        <div class="filters-reset flex items-end justify-end max-[980px]:justify-start">
          <button class="btn pbgui-btn px-[0.9rem] rounded-lg bg-card text-base [transition:background_0.12s,border-color_0.12s,color_0.12s] hover:bg-elevated hover:border-secondary hover:text-[#f2f5fb]" id="btn-reset-filters" @click="emit('reset')">{{ t('market.reset') }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Number-stepper spinners — ported from styles/coin-data.css at the
   Tailwind migration. The ::-webkit-*-spin-button pseudo-elements (and
   the Firefox appearance pair that belongs with them) cannot be
   utilities; every other .num-stepper declaration is a utility on the
   markup above. */
.num-stepper input[type='number']::-webkit-inner-spin-button,
.num-stepper input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.num-stepper input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}
</style>
