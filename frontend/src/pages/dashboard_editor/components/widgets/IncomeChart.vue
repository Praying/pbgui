<script setup lang="ts">
/**
 * IncomeChart — the chart half of the income widget: `_buildIncomeChart`
 * (dashboard_render.js:1473-1579) + the chart fast path (render.js:866-893)
 * on the shared PlotlyChart wrapper (D-4):
 *
 *  - per-symbol cumulative scatter traces via incomeTraces, the dedicated
 *    income layout via incomeLayout (margins l55/r15/t40/b40 + transparent
 *    legend — NOT the PNL skeleton);
 *  - zoom preservation across data updates (the legacy fast path re-applied
 *    autorange:false ranges before every Plotly.react, render.js:878-889) —
 *    PlotlyChart's savedZoom + applyRangeZoom; empty data wipes the memory
 *    (the legacy full rebuild lost the zoom);
 *  - fullscreen targets `.di-root` (legacy gd.closest('.di-root'),
 *    render.js:1528/1558) via the PlotlyChart fullscreenRoot prop;
 *  - height: the editor always passes null (editor:1500) — the chart fills
 *    the cell through the flex chain instead.
 */
import { computed, watch } from 'vue';
import { dashT } from '../../lib/i18n';
import { applyRangeZoom, incomeLayout, incomeTraces } from '../../lib/plotlyLayouts';
import { clearSavedZoom } from '../../lib/savedZoom';
import type { IncomeTrace } from '../../types/widgets';
import { dtNodataClass } from './uiClasses';
import PlotlyChart from './PlotlyChart.vue';

const props = defineProps<{
  traces: IncomeTrace[];
  /** Legacy opts.height — null in the editor (editor:1500). */
  height: number | null;
  /** `row_col` of the owning cell — the zoom-memory key. */
  pos: string;
}>();

const plotTraces = computed(() => incomeTraces(props.traces));
const layout = computed(() => incomeLayout(props.height));

/* legacy fast path requires traces.length > 0 — the empty case is a full
   rebuild that starts from a fresh chart (zoom lost) */
watch(
  () => props.traces,
  (t) => {
    if (!t || t.length === 0) clearSavedZoom(props.pos);
  }
);
</script>

<template>
  <div v-if="traces.length === 0" :class="dtNodataClass">
    {{ dashT('dash.noDataPeriod', 'No data for the selected period.') }}
  </div>
  <PlotlyChart
    v-else
    class="di-chart"
    :traces="plotTraces"
    :layout="layout"
    :height="height"
    :zoom-pos="pos"
    :apply-zoom="applyRangeZoom"
    :display-mode-bar="true"
    :responsive="true"
    fullscreen-root=".di-root"
  />
</template>
