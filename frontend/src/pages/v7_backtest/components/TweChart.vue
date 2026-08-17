<script setup lang="ts">
/**
 * TweChart — renderTWEChart (:7374-7513) with its resolution select
 * (:6670-6679) and the show-coins toggle (:7516-7528). Traces rebuild on
 * resolution change (react keeps zoom, R5); the toggle restyles only the
 * per-coin trace indices (2..n — Long/Short TWE stay visible).
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PlotlyDiv from './PlotlyDiv.vue';
import { chartTitle, tweLayout, tweTraces } from '../lib/resultCharts';
import type { BacktestResultItem, ParsedCsv } from '../types';

const props = defineProps<{
  csv: ParsedCsv | null;
  result: BacktestResultItem;
  /** The legacy element id (twe-chart-{key}). */
  chartId?: string;
  /** Initial resolution in minutes (:6675 default 1440). */
  resolution?: number;
}>();

const RESOLUTIONS = [1440, 720, 240, 60, 30, 15, 10, 5, 2, 1] as const;

const { t } = useI18n();
const resolution = ref<number>(props.resolution ?? 1440);
const showCoins = ref(false);
const plot = ref<InstanceType<typeof PlotlyDiv> | null>(null);

const traces = computed(() => (props.csv ? tweTraces(props.csv, resolution.value, props.result) : []));
const layout = computed(() => tweLayout(`${chartTitle(props.result, fmtDate)} - Wallet Exposure`));

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try {
    const date = new Date(iso);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

/** toggleTWECoins (:7516-7528) — traces 2..n are the per-coin series. */
function toggleCoins(): void {
  const indices: number[] = [];
  for (let i = 2; i < traces.value.length; i++) indices.push(i);
  if (!indices.length) return;
  plot.value?.restyle({ visible: indices.map(() => (showCoins.value ? true : 'legendonly')) }, indices);
}
</script>

<template>
  <div>
    <div style="margin-bottom: var(--sp-xs); display: flex; align-items: center; gap: var(--sp-md); flex-wrap: wrap">
      <label style="font-size: var(--fs-sm); color: var(--text-dim)" title="Small resolutions with many symbols generate a lot of data and can take a long time to render">
        Resolution (min) <span style="cursor: help; opacity: 0.6">(i)</span>:
      </label>
      <select v-model.number="resolution" class="sb-input" style="max-width: 100px" data-test="twe-res">
        <option v-for="value in RESOLUTIONS" :key="value" :value="value">{{ value }}</option>
      </select>
      <label class="sb-toggle" title="Show all per-coin traces (double-click a legend entry to isolate one coin)">
        <input v-model="showCoins" type="checkbox" data-test="twe-showcoins" @change="toggleCoins" />
        <span style="font-size: var(--fs-sm)">Show coins</span>
      </label>
    </div>
    <div v-if="!csv || csv.rows.length === 0" class="empty-state" style="color: var(--text-dim); padding: var(--sp-md)">No fills data</div>
    <div v-else class="chart-wrap">
      <PlotlyDiv ref="plot" :plot-id="chartId" :traces="traces" :layout="layout" />
    </div>
  </div>
</template>
