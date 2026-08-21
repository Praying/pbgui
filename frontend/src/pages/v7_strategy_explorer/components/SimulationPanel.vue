<script setup lang="ts">
/**
 * Simulation stage (:266-302) — the two mode buttons
 * (configureSimulationModes :479-502), max candles/orders, start state
 * select with the manual grid (:279-285, updateSimulationStartStateUi
 * :2091-2105), progress bar, and the two SideWorkspace sim columns
 * (renderSimulationWorkspace :1915-1924).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { deepGet } from '../lib/format';
import SideWorkspace from './SideWorkspace.vue';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { useSimulation } from '../composables/useSimulation';

type Simulation = ReturnType<typeof useSimulation>;

const props = defineProps<{ store: ExplorerStore; simulation: Simulation; simulationModes: { key: string; label: string; labelKey: string }[] }>();
const { t } = useI18n();
const store = props.store;

const isManual = computed(() => store.controls.simStartState === 'manual');

/** inferredManualStartPrice (:2084-2090). */
function inferredManualStartPrice(): number {
  const price = Number(deepGet<number>(store.state.snapshot, ['market', 'reference_price'], 0) || 0);
  if (price > 0) return price;
  const candles = deepGet<{ close?: number; open?: number }[]>(store.state.snapshot, ['candles'], []);
  if (Array.isArray(candles) && candles.length) return Number(candles[0]?.close || candles[0]?.open || 0) || 0;
  return Number(store.controls.referencePrice || 0) || 0;
}
function onStartStateChange(): void {
  store.invalidateSimulationRequest();
  if (isManual.value) {
    if (!store.controls.simStartBalance || store.controls.simStartBalance <= 0) store.controls.simStartBalance = store.controls.balance || 1000;
    const px = inferredManualStartPrice();
    if (px > 0) {
      if (!store.controls.simStartLongPrice || store.controls.simStartLongPrice <= 0) store.controls.simStartLongPrice = px;
      if (!store.controls.simStartShortPrice || store.controls.simStartShortPrice <= 0) store.controls.simStartShortPrice = px;
    }
  }
}
</script>

<template>
  <section id="stage-simulation" class="stage-view" :class="{ active: store.controls.stage === 'simulation' }">
    <section class="panel-card pbgui-card">
      <h3>{{ t('v7explore.simulation') }}</h3>
      <div class="toolbar" style="margin-top:12px">
        <button
          v-for="mode in simulationModes"
          :key="mode.key"
          class="action-btn pbgui-action"
          :class="{ 'active-sim': store.state.activeSimulationMode === mode.key }"
          :disabled="simulation.running.value"
          @click="simulation.runSimulation(mode.key)"
        >
          {{ mode.label || t(mode.labelKey) }}
        </button>
        <span class="muted">{{ t('v7explore.requiresLocalCandles') }}</span>
      </div>
      <div class="grid" style="margin-top:var(--sp-md)">
        <div class="field third"><label for="max-candles-input">{{ t('v7explore.simMaxCandles') }}</label><input id="max-candles-input" v-model.number="store.controls.simMaxCandles" type="number" min="50" max="20000" step="50" @input="store.invalidateSimulationRequest()"></div>
        <div class="field third"><label for="max-orders-input">{{ t('v7explore.simMaxEntryFills') }}</label><input id="max-orders-input" v-model.number="store.controls.simMaxOrders" type="number" min="1" max="2000" step="1" @input="store.invalidateSimulationRequest()"></div>
        <div class="field third">
          <label id="sim-start-state-label" for="sim-start-state-select">{{ t('v7explore.simStartStateWith', { label: simulationModes[0]?.label || store.strategyLabel.value }) }}</label>
          <select id="sim-start-state-select" v-model="store.controls.simStartState" :disabled="store.adapter.isV8" @change="onStartStateChange">
            <option value="flat">{{ t('v7explore.flatCompare') }}</option>
            <option v-if="!store.adapter.isV8" value="manual">{{ t('v7explore.manualCustom') }}</option>
          </select>
        </div>
      </div>
      <div class="grid" id="sim-manual-start-grid" v-show="isManual && !store.adapter.isV8" style="margin-top:var(--sp-md)">
        <div class="field third"><label for="sim-start-balance-input">{{ t('v7explore.startBalance') }}</label><input id="sim-start-balance-input" v-model.number="store.controls.simStartBalance" type="number" min="0" step="10" @input="store.invalidateSimulationRequest()"></div>
        <div class="field third"><label for="sim-start-long-size-input">{{ t('v7explore.longSize') }}</label><input id="sim-start-long-size-input" v-model.number="store.controls.simStartLongSize" type="number" step="0.001" @input="store.invalidateSimulationRequest()"></div>
        <div class="field third"><label for="sim-start-long-price-input">{{ t('v7explore.longPrice') }}</label><input id="sim-start-long-price-input" v-model.number="store.controls.simStartLongPrice" type="number" min="0" step="0.000001" @input="store.invalidateSimulationRequest()"></div>
        <div class="field third"><label for="sim-start-short-size-input">{{ t('v7explore.shortSize') }}</label><input id="sim-start-short-size-input" v-model.number="store.controls.simStartShortSize" type="number" step="0.001" @input="store.invalidateSimulationRequest()"></div>
        <div class="field third"><label for="sim-start-short-price-input">{{ t('v7explore.shortPrice') }}</label><input id="sim-start-short-price-input" v-model.number="store.controls.simStartShortPrice" type="number" min="0" step="0.000001" @input="store.invalidateSimulationRequest()"></div>
      </div>
      <div id="simulation-progress" class="movie-progress" :class="{ active: simulation.progress.value.pct >= 0 }">
        <div class="movie-progress-bar"><div id="simulation-progress-fill" class="movie-progress-fill" :style="{ width: simulation.progress.value.pct + '%' }"></div></div>
        <div id="simulation-progress-text" class="movie-progress-text">{{ simulation.progress.value.message || t('v7explore.waiting') }}</div>
      </div>
    </section>
    <div class="sim-columns">
      <SideWorkspace :store="store" side-key="long" :sim-mode="store.state.activeSimulationMode" />
      <SideWorkspace :store="store" side-key="short" :sim-mode="store.state.activeSimulationMode" />
    </div>
  </section>
</template>
