<script setup lang="ts">
/**
 * PlotlyDiv — the results-chart wrapper around the vendored
 * window.Plotly global (/app/plotly.min.js, never bundled — R2/R5):
 *  - Plotly.newPlot on mount;
 *  - Plotly.react when traces/layout change (the zoom-preserving fast
 *    path — legacy rebuilt innerHTML + newPlot for the TWE resolution
 *    switch; react keeps the interactive state);
 *  - exposed relayout (the log-scale toggle :7206-7210) and restyle
 *    (the TWE show-coins toggle :7516-7528);
 *  - Plotly.purge on unmount (legacy never purged — R4 fix).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getPlotly, plotlyFullscreenConfig, type PlotlyConfig, type PlotlyLayout, type PlotlyTrace } from '../lib/plotlyVendor';

const props = withDefaults(
  defineProps<{
    /** The legacy element id (be-chart-{i}, twe-chart-{i}, …). */
    plotId?: string;
    traces: PlotlyTrace[];
    layout: PlotlyLayout;
    config?: PlotlyConfig | null;
    /** chartWrap's plot height (:6459). */
    height?: number;
  }>(),
  { plotId: undefined, config: null, height: 800 }
);

const { t } = useI18n();
const chartEl = ref<HTMLElement | null>(null);
const plotlyMissing = ref(false);

function render(method: 'newPlot' | 'react'): void {
  const el = chartEl.value;
  if (!el) return;
  const plotly = getPlotly();
  if (!plotly) {
    plotlyMissing.value = true;
    return;
  }
  plotlyMissing.value = false;
  void plotly[method](el, props.traces, props.layout, props.config ?? plotlyFullscreenConfig(t('v7backtest.toggleFullscreen')));
}

onMounted(() => render('newPlot'));
watch(
  () => [props.traces, props.layout],
  () => render('react')
);

onBeforeUnmount(() => {
  const plotly = getPlotly();
  if (plotly && chartEl.value) plotly.purge(chartEl.value);
});

defineExpose({
  /** toggleLogScale (:7206-7210). */
  relayout(updates: PlotlyConfig): void {
    const plotly = getPlotly();
    if (plotly && chartEl.value) void plotly.relayout(chartEl.value, updates);
  },
  /** toggleTWECoins (:7521-7527). */
  restyle(attr: PlotlyTrace, indices: number[]): void {
    const plotly = getPlotly();
    if (plotly && chartEl.value) void plotly.restyle(chartEl.value, attr, indices);
  },
});
</script>

<template>
  <div :id="plotId" ref="chartEl" class="chart-inner" :style="{ height: height + 'px' }">
    <div v-if="plotlyMissing" style="color: var(--red); padding: var(--sp-md)">Plotly not loaded</div>
  </div>
</template>
