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
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
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

/* The stepper inputs keep the legacy draft-then-commit flow (:2418-2430):
   the prop text renders, every keystroke emits number-input, change commits.
   The ui/ Input is v-model-only, so these computed adapters keep the exact
   same call path (get → draft text, set → number-input). */
const marketCapModel = computed<string | number | null>({
  get: () => props.marketCapText,
  set: (value) => {
    emit('number-input', 'market_cap', String(value ?? ''));
  },
});

const volMcapModel = computed<string | number | null>({
  get: () => props.volMcapText,
  set: (value) => {
    emit('number-input', 'vol_mcap', String(value ?? ''));
  },
});

function onExchangeSelect(value: unknown): void {
  emit('set-exchange', String(value ?? ''));
}
</script>

<template>
  <section class="panel coin-filter-panel flex-none overflow-visible rounded-xl border" id="filters-panel">
    <div class="panel-body p-[1rem] overflow-visible">
      <div class="filters-grid grid grid-cols-[minmax(180px,1fr)_minmax(130px,0.7fr)_minmax(130px,0.7fr)_minmax(240px,1.45fr)_auto_auto] gap-2 items-end max-[1280px]:grid-cols-[repeat(3,minmax(0,1fr))] max-[980px]:grid-cols-1">
        <label class="field grid gap-[0.35rem] min-w-0">
          <span class="field-label text-sm text-secondary font-semibold" id="filter-exchange-label">{{ t('market.exchange') }}</span>
          <SelectRoot :model-value="exchange" @update:model-value="onExchangeSelect">
            <SelectTrigger id="filter-exchange" class="coin-filter-control" aria-labelledby="filter-exchange-label">
              <span>{{ exchange }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in exchanges" :key="option" :value="option">{{ option }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </label>
        <label class="field grid gap-[0.35rem] min-w-0">
          <span class="field-label text-sm text-secondary font-semibold">market_cap</span>
          <div class="num-stepper flex items-center">
            <Button class="stepper-btn coin-stepper-btn w-7 shrink-0 rounded-l-lg rounded-r-none border-r-0 p-0 text-[16px] leading-none" type="button" @mousedown.prevent @click="emit('step-number', 'market_cap', -1)">−</Button>
            <Input
              id="filter-market-cap"
              v-model="marketCapModel"
              class="coin-filter-input rounded-none text-center"
              type="number"
              min="0"
              step="250"
              @wheel.prevent="emit('step-number', 'market_cap', ($event as WheelEvent).deltaY < 0 ? 1 : -1)"
              @change="emit('number-change', 'market_cap')"
            />
            <Button class="stepper-btn coin-stepper-btn w-7 shrink-0 rounded-r-lg rounded-l-none border-l-0 p-0 text-[16px] leading-none" type="button" @mousedown.prevent @click="emit('step-number', 'market_cap', 1)">+</Button>
          </div>
        </label>
        <label class="field grid gap-[0.35rem] min-w-0">
          <span class="field-label text-sm text-secondary font-semibold">vol/mcap</span>
          <div class="num-stepper flex items-center">
            <Button class="stepper-btn coin-stepper-btn w-7 shrink-0 rounded-l-lg rounded-r-none border-r-0 p-0 text-[16px] leading-none" type="button" @mousedown.prevent @click="emit('step-number', 'vol_mcap', -1)">−</Button>
            <Input
              id="filter-vol-mcap"
              v-model="volMcapModel"
              class="coin-filter-input rounded-none text-center"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              @wheel.prevent="emit('step-number', 'vol_mcap', ($event as WheelEvent).deltaY < 0 ? 1 : -1)"
              @change="emit('number-change', 'vol_mcap')"
            />
            <Button class="stepper-btn coin-stepper-btn w-7 shrink-0 rounded-r-lg rounded-l-none border-l-0 p-0 text-[16px] leading-none" type="button" @mousedown.prevent @click="emit('step-number', 'vol_mcap', 1)">+</Button>
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
          <span class="coin-filter-pill pill inline-flex items-center gap-[0.35rem] py-[0.28rem] px-[0.65rem] rounded-full border text-secondary text-sm whitespace-nowrap max-w-full overflow-hidden text-ellipsis" id="quotes-pill">{{ quotesLabel }}</span>
        </div>
        <div class="filters-reset flex items-end justify-end max-[980px]:justify-start">
          <Button variant="secondary" id="btn-reset-filters" type="button" @click="emit('reset')">{{ t('market.reset') }}</Button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.coin-filter-panel {
  border-color: var(--coin-border);
  background: var(--coin-control);
  box-shadow:
    0 14px 28px rgb(2 8 14 / 0.17),
    0 1px 0 rgb(224 241 255 / 0.05) inset;
}

.coin-filter-control,
.coin-filter-input,
.coin-stepper-btn {
  border-color: var(--coin-border-strong);
  background: var(--coin-input);
}

.coin-stepper-btn {
  color: var(--text-secondary);
}

.coin-stepper-btn:hover:not(:disabled) {
  border-color: rgb(var(--accent-rgb) / 0.38);
  background: color-mix(in srgb, var(--coin-input) 88%, var(--accent) 12%);
  color: var(--accent-soft);
}

.coin-filter-input:focus-visible,
.coin-filter-control:focus-visible {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.coin-filter-pill {
  border-color: var(--coin-border);
  background: rgb(155 191 255 / 0.045);
}

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
