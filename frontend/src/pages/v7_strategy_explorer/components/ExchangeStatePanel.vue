<script setup lang="ts">
/**
 * Exchange / State stage — the steppers of renderExchangeState
 * (:1956-2004): exchange param overrides, wallet balance and volatility
 * steppers with market-source notes (:1943-1955), plus the markets.json
 * debug accordion (:254).
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { paramTooltip } from '../lib/params';
import { deepGet, fmt } from '../lib/format';
import type { ExplorerStore } from '../composables/useStrategyExplorer';

const props = defineProps<{ store: ExplorerStore }>();
const { t } = useI18n();
const store = props.store;
const debugOpen = ref(false);

interface StepperDef {
  id: string;
  key: 'min_cost' | 'price_step' | 'min_qty' | 'qty_step' | 'c_mult' | 'state_balance' | 'state_volatility';
  label: string;
  step: number;
  slot: 'exchangeParamOverrides' | 'stateParamOverrides';
  storeKey: string;
  sourceText: string;
  value: number;
}

const metadata = computed(() => deepGet<Record<string, unknown>>(store.state.snapshot, ['market', 'metadata'], {}) || {});
const exchangeParams = computed(() => deepGet<Record<string, number>>(store.state.snapshot, ['sides', 'long', 'debug', 'exchange_params'], {}) || {});
const stateParams = computed(() => deepGet<Record<string, number>>(store.state.snapshot, ['sides', 'long', 'debug', 'state_params'], {}) || {});

/** exchangeParamSource (:1943-1955). */
function exchangeParamSource(key: string, value: number): string {
  const derived = deepGet<Record<string, unknown>>(metadata.value, ['market_metadata', 'derived'], {}) || {};
  const sourceKey = {
    min_cost: 'min_cost_from_limits.cost.min',
    price_step: 'price_step_from_precision.price',
    min_qty: 'min_qty_from_limits.amount.min',
    qty_step: 'qty_step_from_precision.amount',
    c_mult: 'c_mult_from_contractSize',
  }[key];
  const raw = sourceKey ? deepGet<unknown>(derived, sourceKey.split('.'), undefined) : undefined;
  if (raw === undefined || raw === null || raw === '') return t('v7explore.sourceCurrent', { value: fmt(value, 8) });
  return t('v7explore.sourceMarket', { value: String(raw) });
}

const steppers = computed<StepperDef[]>(() => {
  const volatility = Number(stateParams.value.entry_volatility_logrange_ema_1h || 0);
  const balance = Number(stateParams.value.balance ?? deepGet<number>(store.state.snapshot, ['config', 'backtest', 'starting_balance'], 1000));
  const defs: Array<[string, StepperDef['key'], string, number, StepperDef['slot'], string, number]> = [
    ['ep-min-cost', 'min_cost', 'min_cost', 0.01, 'exchangeParamOverrides', 'min_cost', Number(exchangeParams.value.min_cost || 0)],
    ['ep-price-step', 'price_step', 'price_step', 0.000001, 'exchangeParamOverrides', 'price_step', Number(exchangeParams.value.price_step || 0)],
    ['ep-min-qty', 'min_qty', 'min_qty', 0.000001, 'exchangeParamOverrides', 'min_qty', Number(exchangeParams.value.min_qty || 0)],
    ['ep-qty-step', 'qty_step', 'qty_step', 0.000001, 'exchangeParamOverrides', 'qty_step', Number(exchangeParams.value.qty_step || 0)],
    ['ep-c-mult', 'c_mult', 'c_mult', 0.000001, 'exchangeParamOverrides', 'c_mult', Number(exchangeParams.value.c_mult || 0)],
    ['state-balance', 'state_balance', t('v7explore.walletBalanceState'), 1, 'stateParamOverrides', 'balance', balance],
    ['state-volatility', 'state_volatility', t('v7explore.volLogRangeEma'), 0.0001, 'stateParamOverrides', 'entry_volatility_logrange_ema_1h', volatility],
  ];
  return defs.map(([id, key, label, step, slot, storeKey, value]) => ({
    id,
    key,
    label,
    step,
    slot,
    storeKey,
    value,
    sourceText: slot === 'exchangeParamOverrides' ? exchangeParamSource(key, value) : '',
  }));
});

function onStepperChange(def: StepperDef, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value || 0);
  store.state[def.slot][def.storeKey] = value;
  if (def.id === 'state-balance') store.controls.balance = value;
  void store.recalculate();
}
function step(def: StepperDef, dir: number): void {
  const next = Number((Number(def.value) + def.step * dir).toFixed(12));
  store.state[def.slot][def.storeKey] = next;
  if (def.id === 'state-balance') store.controls.balance = next;
  void store.recalculate();
}
function resetExchangeParams(): void {
  store.state.exchangeParamOverrides = {};
  store.state.autoExchangeParams = true;
  void store.recalculate();
}
const debugJson = computed(() => JSON.stringify(metadata.value, null, 2));

/** Localized stepper tooltip — same resolution order as ParamTuning fields. */
function fieldTip(key: StepperDef['key']): string {
  return paramTooltip(key, store.strategyLabel.value, (k, p) => t(k, p ?? {}));
}
</script>

<template>
  <div class="pbgui-card border border-border-default rounded-xl bg-panel p-3.5">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h3 class="m-0">{{ t('v7explore.exchangeState') }}</h3>
      <div class="flex flex-wrap items-center gap-2.5">
        <span class="flex items-center gap-2 text-secondary text-sm">
          <Checkbox id="auto-exchange-params" v-model="store.state.autoExchangeParams" @update:model-value="store.recalculate()" />
          <label for="auto-exchange-params">{{ t('v7explore.autoFillExchangeParams') }}</label>
        </span>
        <Button class="action-btn" variant="default" id="btn-reset-exchange-params" type="button" @click="resetExchangeParams">{{ t('v7explore.resetExchangeParams') }}</Button>
      </div>
    </div>
    <!-- ui-migration: out of scope — accordion disclosure chrome (the .accordion-head
         pseudo-element chevron in App.vue's style block), not a form control -->
    <section class="accordion-card overflow-hidden rounded-lg border border-border-default bg-panel mt-2.5" :class="{ collapsed: !debugOpen }">
      <button class="accordion-head flex w-full items-center gap-2.5 border-0 bg-panel px-3 py-2.5 text-left text-primary" type="button" @click="debugOpen = !debugOpen">{{ t('v7explore.debugDataSources') }}</button>
      <div class="accordion-body border-t border-border-default p-3"><pre id="exchange-state-json" class="w-full max-h-[460px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-default bg-page p-2.5 font-mono text-xs">{{ debugJson }}</pre></div>
    </section>
    <div class="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-3 mt-3 max-[1250px]:grid-cols-[1fr]" id="exchange-state-controls">
      <div v-for="def in steppers" :key="def.id" class="flex flex-col gap-1 col-span-6 max-[1250px]:col-span-full">
        <Label :for="def.id" :data-tip="fieldTip(def.key)">{{ def.label }}</Label>
        <div class="flex">
          <Button type="button" class="w-[34px] shrink-0 rounded-r-none border-r-0 px-0" @click="step(def, -1)">&minus;</Button>
          <Input class="rounded-none" :id="def.id" type="number" :step="def.step" :model-value="def.value" :data-tip="fieldTip(def.key)" @change="onStepperChange(def, $event)" />
          <Button type="button" class="w-[34px] shrink-0 rounded-l-none border-l-0 px-0" @click="step(def, 1)">+</Button>
        </div>
        <div class="mt-1 mb-2.5 text-secondary text-xs">{{ def.sourceText }}</div>
      </div>
    </div>
  </div>
</template>
