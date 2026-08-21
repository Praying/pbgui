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
  <section class="panel" id="filters-panel">
    <div class="panel-body">
      <div class="filters-grid">
        <label class="field">
          <span class="field-label">{{ t('market.exchange') }}</span>
          <select id="filter-exchange" :value="exchange" @change="emit('set-exchange', ($event.target as HTMLSelectElement).value)">
            <option v-for="option in exchanges" :key="option" :value="option" :selected="option === exchange">{{ option }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">market_cap</span>
          <div class="num-stepper">
            <button class="stepper-btn" type="button" @mousedown.prevent @click="emit('step-number', 'market_cap', -1)">−</button>
            <input
              id="filter-market-cap"
              type="number"
              min="0"
              step="250"
              :value="marketCapText"
              @wheel.prevent="emit('step-number', 'market_cap', ($event as WheelEvent).deltaY < 0 ? 1 : -1)"
              @input="emit('number-input', 'market_cap', ($event.target as HTMLInputElement).value)"
              @change="emit('number-change', 'market_cap')"
            >
            <button class="stepper-btn" type="button" @mousedown.prevent @click="emit('step-number', 'market_cap', 1)">+</button>
          </div>
        </label>
        <label class="field">
          <span class="field-label">vol/mcap</span>
          <div class="num-stepper">
            <button class="stepper-btn" type="button" @mousedown.prevent @click="emit('step-number', 'vol_mcap', -1)">−</button>
            <input
              id="filter-vol-mcap"
              class="stepper-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              :value="volMcapText"
              @wheel.prevent="emit('step-number', 'vol_mcap', ($event as WheelEvent).deltaY < 0 ? 1 : -1)"
              @input="emit('number-input', 'vol_mcap', ($event.target as HTMLInputElement).value)"
              @change="emit('number-change', 'vol_mcap')"
            >
            <button class="stepper-btn" type="button" @mousedown.prevent @click="emit('step-number', 'vol_mcap', 1)">+</button>
          </div>
        </label>
        <div class="field">
          <span class="field-label">{{ t('market.tags') }}</span>
          <TagMultiselect
            :options="tagOptions"
            :model-value="tags"
            :disabled="!tagOptions.length"
            @update:model-value="emit('set-tags', $event)"
          />
        </div>
        <div class="filters-status">
          <span class="pill" id="quotes-pill">{{ quotesLabel }}</span>
        </div>
        <div class="filters-reset">
          <button class="btn pbgui-btn" id="btn-reset-filters" @click="emit('reset')">{{ t('market.reset') }}</button>
        </div>
      </div>
    </div>
  </section>
</template>
