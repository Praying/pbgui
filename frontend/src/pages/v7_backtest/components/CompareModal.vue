<script setup lang="ts">
/**
 * CompareModal — the inline compare-chart area (:862-863, :7608-7643):
 * Plotly pairs of equity+balance per selected/queued result directly
 * under the table. Named "Modal" per the recon's component list; the
 * legacy behavior is this inline toggle-on/toggle-off plot, kept exactly.
 */
import PlotlyDiv from './PlotlyDiv.vue';
import type { PlotlyLayout, PlotlyTrace } from '../lib/plotlyVendor';

defineProps<{
  open: boolean;
  traces: PlotlyTrace[];
  layout: PlotlyLayout;
}>();
</script>

<template>
  <div id="compare-chart-area" :style="open && traces.length > 0 ? '' : 'display: none'">
    <div v-if="open && traces.length === 0" style="text-align: center; padding: var(--sp-lg); color: var(--text-dim)">
      No equity data found for the selected results.
    </div>
    <div v-else-if="open" class="chart-wrap">
      <PlotlyDiv plot-id="compare-chart-div" :traces="traces" :layout="layout" />
    </div>
  </div>
</template>
