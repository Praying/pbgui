<script setup lang="ts">
/**
 * Exchange / State stage — the steppers of renderExchangeState
 * (:1956-2004): exchange param overrides, wallet balance and volatility
 * steppers with market-source notes (:1943-1955), plus the markets.json
 * debug accordion (:254).
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
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
          <input id="auto-exchange-params" class="w-auto" v-model="store.state.autoExchangeParams" type="checkbox" @change="store.recalculate()">
          <label for="auto-exchange-params">{{ t('v7explore.autoFillExchangeParams') }}</label>
        </span>
        <button class="action-btn pbgui-action border border-border-default rounded-[7px] bg-elevated py-1.75 px-2.75 text-primary transition-[border-color,background-color,color] duration-150 ease-[ease] hover:border-accent/45 hover:bg-accent/10" id="btn-reset-exchange-params" type="button" @click="resetExchangeParams">{{ t('v7explore.resetExchangeParams') }}</button>
      </div>
    </div>
    <section class="accordion-card overflow-hidden rounded-lg border border-border-default bg-panel mt-2.5" :class="{ collapsed: !debugOpen }">
      <button class="accordion-head flex w-full items-center gap-2.5 border-0 bg-panel px-3 py-2.5 text-left text-primary" type="button" @click="debugOpen = !debugOpen">{{ t('v7explore.debugDataSources') }}</button>
      <div class="accordion-body border-t border-border-default p-3"><pre id="exchange-state-json" class="w-full max-h-[460px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-default bg-page p-2.5 font-mono text-xs">{{ debugJson }}</pre></div>
    </section>
    <div class="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-3 mt-3 max-[1250px]:grid-cols-[1fr]" id="exchange-state-controls">
      <div v-for="def in steppers" :key="def.id" class="flex flex-col gap-1 col-span-6 max-[1250px]:col-span-full">
        <label class="text-secondary text-xs uppercase tracking-[0.04em]" :for="def.id" :data-tip="fieldTip(def.key)">{{ def.label }}</label>
        <div class="flex">
          <button type="button" class="w-[34px] rounded-l-md border-r-0 border border-border-default bg-elevated text-primary" @click="step(def, -1)">&minus;</button>
          <input class="w-full min-w-0 min-h-8 rounded-none border border-border-default bg-page px-2 py-1.75 text-primary" :id="def.id" type="number" :step="def.step" :value="def.value" :data-tip="fieldTip(def.key)" @change="onStepperChange(def, $event)">
          <button type="button" class="w-[34px] rounded-r-md border-l-0 border border-border-default bg-elevated text-primary" @click="step(def, 1)">+</button>
        </div>
        <div class="mt-1 mb-2.5 text-secondary text-xs">{{ def.sourceText }}</div>
      </div>
    </div>
  </div>
</template>
