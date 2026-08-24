<script setup lang="ts">
/**
 * XY / XZ / YZ projection triptych — renderPlayground's 3D-Projections
 * branch (:3372-3382) plus the side-by-side layout switch (:2082-2089,
 * :4392-4397). Each figure newPlots once on mount, fits its wrap, remembers
 * its height and clicks through to the config detail.
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ScatterChart from './ScatterChart.vue';
import { getPlotly } from '../lib/plotlyVendor';
import { fitChartToWrap } from '../composables/useChartState';
import type { ChartSpec } from '../types';
import type { ParetoStore } from '../composables/useParetoSession';
import type { Surfaces } from '../composables/useSurfaces';

const props = defineProps<{
  store: ParetoStore;
  surfaces: Surfaces;
}>();

const { t } = useI18n();
const store = props.store;

const projections = () => (store.state.playground.payload?.visualizations?.projections || null) as
  | { xy?: ChartSpec | null; xz?: ChartSpec | null; yz?: ChartSpec | null }
  | null;

const PANELS: { key: 'xy' | 'xz' | 'yz'; id: string; titleKey: string }[] = [
  { key: 'xy', id: 'playground-chart-proj-xy', titleKey: 'v7explore.xyProjection' },
  { key: 'xz', id: 'playground-chart-proj-xz', titleKey: 'v7explore.xzProjection' },
  { key: 'yz', id: 'playground-chart-proj-yz', titleKey: 'v7explore.yzProjection' },
];

/** The .chart-stack / .chart-stack.projections-row pair — complete
    independent layout sets ('projections-row' stays as the anchor the
    layout-toggle test keys off). */
function projectionStackClass(layout: string): string {
  return layout === 'row'
    ? 'chart-stack projections-row grid grid-cols-[repeat(3,minmax(0,1fr))] items-start gap-3 max-[1500px]:grid-cols-1'
    : 'chart-stack flex flex-col gap-3';
}

/** resizeProjectionCharts (:2113-2119, :4396) — refit after the layout flip. */
function refit(): void {
  const plotly = getPlotly();
  if (!plotly) return;
  for (const panel of PANELS) {
    const node = document.getElementById(panel.id);
    if (node && node.classList.contains('js-plotly-plot')) fitChartToWrap(plotly, node);
  }
}

function onPlotClick(configIndex: number): void {
  props.surfaces.loadConfigDetail(configIndex).catch(() => {});
}

watch(
  () => store.state.playground.projectionLayout,
  () => setTimeout(refit, 0)
);

onMounted(() => {
  // selectStage's playground resize pass (:4146-4150)
  requestAnimationFrame(() => setTimeout(refit, 80));
});

onBeforeUnmount(() => {
  // mounted under v-if; Plotly purge happens per ScatterChart unmount
});
</script>

<template>
  <div
    id="playground-projections"
    :class="projectionStackClass(store.state.playground.projectionLayout)"
  >
    <div v-for="panel in PANELS" :key="panel.key" class="projection-panel">
      <div class="projection-panel-title mb-2 text-center text-sm font-semibold text-secondary">{{ t(panel.titleKey) }}</div>
      <div class="chart-wrap projection-wrap relative min-w-0 overflow-hidden h-[420px] min-h-[420px]">
        <ScatterChart
          :chart-id="panel.id"
          :spec="projections()?.[panel.key] ?? null"
          placeholder-key="v7explore.loadToRenderExplorerChart"
          fit-to-wrap
          click-selects-config
          :best-match-index="store.state.playground.payload?.best_match?.config_index ?? null"
          @plot-click="onPlotClick"
        />
      </div>
    </div>
  </div>
</template>
