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
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
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
  <section id="stage-simulation" :class="store.controls.stage === 'simulation' ? 'active block' : 'hidden'">
    <section class="pbgui-card border border-border-default rounded-xl bg-panel p-3.5">
      <h3 class="m-0 mb-2.5">{{ t('v7explore.simulation') }}</h3>
      <div class="flex flex-wrap items-center gap-2" style="margin-top:12px">
        <Button
          v-for="mode in simulationModes"
          :key="mode.key"
          type="button"
          class="action-btn"
          :class="{ 'active-sim': store.state.activeSimulationMode === mode.key }"
          :variant="store.state.activeSimulationMode === mode.key ? 'info' : 'default'"
          :disabled="simulation.running.value"
          @click="simulation.runSimulation(mode.key)"
        >
          {{ mode.label || t(mode.labelKey) }}
        </Button>
        <span class="text-secondary">{{ t('v7explore.requiresLocalCandles') }}</span>
      </div>
      <div class="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-3 max-[1250px]:grid-cols-[1fr]" style="margin-top:var(--sp-md)">
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full"><Label for="max-candles-input">{{ t('v7explore.simMaxCandles') }}</Label><Input id="max-candles-input" v-model.number="store.controls.simMaxCandles" type="number" min="50" max="20000" step="50" @input="store.invalidateSimulationRequest()" /></div>
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full"><Label for="max-orders-input">{{ t('v7explore.simMaxEntryFills') }}</Label><Input id="max-orders-input" v-model.number="store.controls.simMaxOrders" type="number" min="1" max="2000" step="1" @input="store.invalidateSimulationRequest()" /></div>
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full">
          <Label id="sim-start-state-label" for="sim-start-state-select">{{ t('v7explore.simStartStateWith', { label: simulationModes[0]?.label || store.strategyLabel.value }) }}</Label>
          <SelectRoot v-model="store.controls.simStartState" @update:model-value="onStartStateChange">
            <SelectTrigger id="sim-start-state-select" aria-labelledby="sim-start-state-label" :disabled="store.adapter.isV8">
              <span>{{ store.controls.simStartState === 'manual' ? t('v7explore.manualCustom') : t('v7explore.flatCompare') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">{{ t('v7explore.flatCompare') }}</SelectItem>
              <SelectItem v-if="!store.adapter.isV8" value="manual">{{ t('v7explore.manualCustom') }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </div>
      </div>
      <div class="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-3 max-[1250px]:grid-cols-[1fr]" id="sim-manual-start-grid" v-show="isManual && !store.adapter.isV8" style="margin-top:var(--sp-md)">
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full"><Label for="sim-start-balance-input">{{ t('v7explore.startBalance') }}</Label><Input id="sim-start-balance-input" v-model.number="store.controls.simStartBalance" type="number" min="0" step="10" @input="store.invalidateSimulationRequest()" /></div>
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full"><Label for="sim-start-long-size-input">{{ t('v7explore.longSize') }}</Label><Input id="sim-start-long-size-input" v-model.number="store.controls.simStartLongSize" type="number" step="0.001" @input="store.invalidateSimulationRequest()" /></div>
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full"><Label for="sim-start-long-price-input">{{ t('v7explore.longPrice') }}</Label><Input id="sim-start-long-price-input" v-model.number="store.controls.simStartLongPrice" type="number" min="0" step="0.000001" @input="store.invalidateSimulationRequest()" /></div>
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full"><Label for="sim-start-short-size-input">{{ t('v7explore.shortSize') }}</Label><Input id="sim-start-short-size-input" v-model.number="store.controls.simStartShortSize" type="number" step="0.001" @input="store.invalidateSimulationRequest()" /></div>
        <div class="flex flex-col gap-1 col-span-4 max-[1250px]:col-span-full"><Label for="sim-start-short-price-input">{{ t('v7explore.shortPrice') }}</Label><Input id="sim-start-short-price-input" v-model.number="store.controls.simStartShortPrice" type="number" min="0" step="0.000001" @input="store.invalidateSimulationRequest()" /></div>
      </div>
      <div id="simulation-progress" class="mt-2.5" :class="simulation.progress.value.pct >= 0 ? 'block' : 'hidden'">
        <div class="h-2.5 overflow-hidden rounded-full border border-border-default bg-page"><div id="simulation-progress-fill" class="h-full w-0 bg-[linear-gradient(90deg,var(--accent),var(--success))] transition-[width] duration-200 ease-[ease]" :style="{ width: simulation.progress.value.pct + '%' }"></div></div>
        <div id="simulation-progress-text" class="mt-1.5 text-secondary text-sm">{{ simulation.progress.value.message || t('v7explore.waiting') }}</div>
      </div>
    </section>
    <div class="grid grid-cols-[repeat(2,minmax(420px,1fr))] items-start gap-3 mt-3 max-[1250px]:grid-cols-[1fr]">
      <SideWorkspace :store="store" side-key="long" :sim-mode="store.state.activeSimulationMode" />
      <SideWorkspace :store="store" side-key="short" :sim-mode="store.state.activeSimulationMode" />
    </div>
  </section>
</template>
