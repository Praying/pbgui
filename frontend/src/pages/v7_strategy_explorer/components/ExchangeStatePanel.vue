<script setup lang="ts">
/**
 * Exchange / State stage — the steppers of renderExchangeState
 * (:1956-2004): exchange param overrides, wallet balance and volatility
 * steppers with market-source notes (:1943-1955), plus the markets.json
 * debug accordion (:254).
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { FIELD_TOOLTIPS } from '../lib/params';
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
</script>

<template>
  <div class="panel-card">
    <h3>{{ t('v7explore.exchangeState') }}</h3>
    <div class="control-group">
      <p class="muted" style="margin:0 0 8px">{{ t('v7explore.exchangeParameters') }}</p>
      <div class="check-row">
        <input id="auto-exchange-params" v-model="store.state.autoExchangeParams" type="checkbox" @change="store.recalculate()">
        <label for="auto-exchange-params">{{ t('v7explore.autoFillExchangeParams') }}</label>
      </div>
      <button class="action-btn" id="btn-reset-exchange-params" type="button" @click="resetExchangeParams">{{ t('v7explore.resetExchangeParams') }}</button>
      <section class="accordion-card collapsed" style="margin-top:8px">
        <button class="accordion-head" type="button" @click="debugOpen = !debugOpen">{{ t('v7explore.debugDataSources') }}</button>
        <div class="accordion-body"><pre id="exchange-state-json" class="debug-json">{{ debugJson }}</pre></div>
      </section>
      <div class="grid" style="margin-top:12px" id="exchange-state-controls">
        <div v-for="def in steppers" :key="def.id" class="field half">
          <label :for="def.id" :data-tip="FIELD_TOOLTIPS[def.key] || ''">{{ def.label }}</label>
          <div class="num-stepper">
            <button type="button" @click="step(def, -1)">&minus;</button>
            <input :id="def.id" type="number" :step="def.step" :value="def.value" :data-tip="FIELD_TOOLTIPS[def.key] || ''" @change="onStepperChange(def, $event)">
            <button type="button" @click="step(def, 1)">+</button>
          </div>
          <div class="source-note">{{ def.sourceText }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
